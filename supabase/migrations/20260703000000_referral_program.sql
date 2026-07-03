-- Referral program ("Give a month, get a month")
-- One invite code per user; friend redeems at signup; referral converts when the
-- friend completes their FIRST workout (fraud-resistant). Tier rewards at 1/3/5
-- conversions are logged in referral_rewards with fulfilled=false — actually
-- applying the free months / lifetime entitlement in RevenueCat is a manual
-- (or future automated) step.

-- 1) One human-readable invite code per user
CREATE TABLE IF NOT EXISTS referral_codes (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  code       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Referee -> referrer attribution. One referrer per referee, locked at redemption.
CREATE TABLE IF NOT EXISTS referrals (
  referee_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  referrer_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,
  status         TEXT NOT NULL DEFAULT 'signed_up' CHECK (status IN ('signed_up', 'converted')),
  -- fulfillment flag for the referrer's "+1 month per conversion" reward
  reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  converted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON referrals (referrer_id);

-- 3) Tier milestone rewards earned by referrers (1 / 3 / 5 conversions)
CREATE TABLE IF NOT EXISTS referral_rewards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier        INT  NOT NULL CHECK (tier IN (1, 3, 5)),
  reward      TEXT NOT NULL, -- '1_month_free' | '3_months_free' | 'lifetime_pro'
  granted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled   BOOLEAN NOT NULL DEFAULT FALSE,
  UNIQUE (referrer_id, tier)
);

ALTER TABLE referral_codes   ENABLE ROW LEVEL SECURITY;
ALTER TABLE referrals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_rewards ENABLE ROW LEVEL SECURITY;

-- Owners can read their own rows; all writes go through the SECURITY DEFINER functions below.
CREATE POLICY "own_referral_code" ON referral_codes
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_referrals" ON referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);
CREATE POLICY "own_referral_rewards" ON referral_rewards
  FOR SELECT USING (auth.uid() = referrer_id);

-- 6-char code from an unambiguous alphabet (no 0/O/1/I)
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
  alphabet CONSTANT TEXT := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  result TEXT;
BEGIN
  LOOP
    result := '';
    FOR i IN 1..6 LOOP
      result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::INT, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM referral_codes WHERE code = result);
  END LOOP;
  RETURN result;
END;
$$;

-- Everything the referral screen needs in one call. Creates the caller's code on first use.
CREATE OR REPLACE FUNCTION get_referral_status()
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  my_code TEXT;
  conversion_count INT;
  invitee_list JSONB;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT code INTO my_code FROM referral_codes WHERE user_id = uid;
  IF my_code IS NULL THEN
    INSERT INTO referral_codes (user_id, code)
    VALUES (uid, generate_referral_code())
    ON CONFLICT (user_id) DO NOTHING;
    SELECT code INTO my_code FROM referral_codes WHERE user_id = uid;
  END IF;

  SELECT COUNT(*)::INT INTO conversion_count
  FROM referrals WHERE referrer_id = uid AND status = 'converted';

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', COALESCE(u.raw_user_meta_data->>'name', 'A friend'),
    'status', r.status,
    'joined_at', r.created_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
  INTO invitee_list
  FROM referrals r JOIN auth.users u ON u.id = r.referee_id
  WHERE r.referrer_id = uid;

  RETURN jsonb_build_object(
    'code', my_code,
    'conversions', conversion_count,
    'invitees', invitee_list
  );
END;
$$;

-- Called once by a new user to attach themselves to a referrer.
CREATE OR REPLACE FUNCTION redeem_referral_code(p_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid UUID := auth.uid();
  normalized TEXT := upper(trim(p_code));
  ref_user UUID;
  account_created TIMESTAMPTZ;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO ref_user FROM referral_codes WHERE code = normalized;
  IF ref_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF ref_user = uid THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;
  IF EXISTS (SELECT 1 FROM referrals WHERE referee_id = uid) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_referred');
  END IF;
  -- Rewards only from new accounts
  SELECT created_at INTO account_created FROM auth.users WHERE id = uid;
  IF account_created < NOW() - INTERVAL '14 days' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'account_too_old');
  END IF;

  INSERT INTO referrals (referee_id, referrer_id, code) VALUES (uid, ref_user, normalized);
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Conversion: referee completes their first workout -> referral converts (idempotent:
-- only flips signed_up -> converted once), then tier milestones are granted.
CREATE OR REPLACE FUNCTION handle_referral_conversion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  ref_referrer UUID;
  conversion_count INT;
  t RECORD;
BEGIN
  UPDATE referrals
  SET status = 'converted', converted_at = NOW()
  WHERE referee_id = NEW.user_id AND status = 'signed_up'
  RETURNING referrer_id INTO ref_referrer;

  IF ref_referrer IS NOT NULL THEN
    SELECT COUNT(*)::INT INTO conversion_count
    FROM referrals WHERE referrer_id = ref_referrer AND status = 'converted';

    FOR t IN SELECT * FROM (VALUES
      (1, '1_month_free'),
      (3, '3_months_free'),
      (5, 'lifetime_pro')
    ) AS v(tier, reward) LOOP
      IF conversion_count >= t.tier THEN
        INSERT INTO referral_rewards (referrer_id, tier, reward)
        VALUES (ref_referrer, t.tier, t.reward)
        ON CONFLICT (referrer_id, tier) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS workout_sessions_referral_conversion ON workout_sessions;
CREATE TRIGGER workout_sessions_referral_conversion
  AFTER INSERT ON workout_sessions
  FOR EACH ROW EXECUTE FUNCTION handle_referral_conversion();
