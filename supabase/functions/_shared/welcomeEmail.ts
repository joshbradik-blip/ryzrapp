// Single source of truth for the RYZR welcome email.
//
// Previously this markup was copy-pasted into both `send-ryzr-email` and
// `send-ryzr-welcome-batch`, so the two could drift apart. Every function that
// sends the welcome email now imports from here.
//
// The copy comes from the Resend Broadcast version of this email (the one
// actually sent to the early user list). Two Broadcast-only merge tags had to be
// translated, because they are expanded by Resend's Broadcast pipeline and NOT
// by the transactional send API — pasted verbatim they reach the recipient as
// literal `{{{...}}}` text:
//
//   {{{contact.first_name|there}}} -> interpolated here from signup metadata
//   {{{RESEND_UNSUBSCRIBE_URL}}}   -> a mailto: unsubscribe (see UNSUBSCRIBE_MAILTO)

export const WELCOME_CAMPAIGN = 'ryzr-free-month-2026';

export const WELCOME_FROM = 'Josh Perry, Founder of RYZR <josh@bradikenterprises.com>';
export const WELCOME_REPLY_TO = 'josh@bradikenterprises.com';
export const WELCOME_SUBJECT = 'Welcome to RYZR — Your Free Month is Waiting';

/** Promo code shown in the email, redeemed via App Store offer codes / Play billing. */
export const PROMO_CODE = 'RYZR30';

/**
 * Broadcasts get a hosted one-click unsubscribe URL from Resend; transactional
 * sends do not, so this email carries a mailto: unsubscribe instead. It is
 * honoured by hand today. Wiring up a real suppression list (a table checked
 * before each send, plus an HTTPS endpoint for one-click) is the follow-up if
 * this email ever goes out at higher volume.
 */
export const UNSUBSCRIBE_MAILTO =
  'mailto:josh@bradikenterprises.com?subject=Unsubscribe';

/**
 * The display name comes from user-supplied signup metadata, so it must never be
 * interpolated into the template raw.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Pull a usable first name out of whatever the signup flow stored. The app writes
 * `{ data: { name } }` on `auth.signUp` (see `src/store/authStore.ts`), but older
 * rows and OAuth providers use other shapes, so check the common ones.
 *
 * Mirrors the Broadcast tag's `|there` fallback.
 */
export function resolveFirstName(metadata: Record<string, unknown> | null | undefined): string {
  const meta = metadata ?? {};

  const candidates = [
    meta.first_name,
    meta.firstName,
    meta.name,
    meta.full_name,
  ];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const first = candidate.trim().split(/\s+/)[0];
    if (first) return first;
  }

  return 'there';
}

/** Ready-to-send Resend payload for the welcome email. */
export function welcomeEmailPayload(to: string, firstName: string) {
  return {
    from: WELCOME_FROM,
    replyTo: WELCOME_REPLY_TO,
    to: [to],
    subject: WELCOME_SUBJECT,
    html: buildWelcomeEmail(firstName),
    // Surfaces the "Unsubscribe" affordance in Gmail/Apple Mail alongside the
    // in-body link, which mail providers increasingly expect on bulk-ish mail.
    headers: {
      'List-Unsubscribe': `<${UNSUBSCRIBE_MAILTO}>`,
    },
  };
}

export function buildWelcomeEmail(rawFirstName: string): string {
  const firstName = escapeHtml(rawFirstName || 'there');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>RYZR — Your Free Month is Waiting</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">

  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Thanks for trying RYZR. I'd love your feedback — and here's a free month of Premium.
  </div>

  <div style="max-width:620px;margin:0 auto;background:#ffffff;">

    <div style="background:#171717;padding:42px 28px;text-align:center;">
      <div style="font-size:40px;font-weight:800;letter-spacing:3px;color:#ffffff;">
        RYZR
      </div>
      <div style="margin-top:10px;font-size:19px;color:#f0a23a;">
        Train for the life you want.
      </div>
    </div>

    <div style="padding:36px 32px;color:#2b2b2b;font-size:17px;line-height:1.65;">

      <p style="margin-top:0;">
        Hi ${firstName},
      </p>

      <p>
        I'm Josh, the founder of RYZR. First, thank you for giving the app a chance.
        I know there are a lot of fitness apps out there, so I don't take it lightly that you downloaded mine.
      </p>

      <p>
        I built RYZR because I wanted more than another workout app. I wanted a coach that adapts
        to your goals, your equipment, your recovery, and the things you actually want to be able to do in life.
      </p>

      <p>
        Whether that's surfing, hiking, running, getting stronger, keeping up with your family,
        or simply feeling better every day, that's what RYZR is built around.
      </p>

      <div style="margin:32px 0;padding:24px;background:#fafafa;border:1px solid #e8e8e8;border-radius:12px;">
        <div style="font-size:22px;font-weight:700;margin-bottom:12px;">
          I'd love your feedback
        </div>

        <p style="margin-bottom:10px;">
          When you reply, it comes directly to me — not a support team. I'd love to know:
        </p>

        <p style="margin:6px 0;">• What's your favorite part of RYZR so far?</p>
        <p style="margin:6px 0;">• What's one thing you'd improve?</p>
        <p style="margin:6px 0;">• Is there anything you expected to find but couldn't?</p>

        <p style="margin-bottom:18px;">
          I personally read every response because RYZR is still being shaped by the people who use it.
        </p>

        <a href="mailto:${WELCOME_REPLY_TO}?subject=RYZR%20Feedback"
           style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;">
          Send Feedback
        </a>
      </div>

      <div style="text-align:center;margin:38px 0 18px;">
        <div style="font-size:27px;font-weight:800;">
          Your free month of Premium
        </div>

        <p style="margin:12px auto 24px;max-width:500px;">
          As one of the first people to try RYZR, I'd love to thank you with one month of Premium free.
        </p>
      </div>

      <div style="border:1px solid #e3e3e3;border-radius:12px;padding:24px;margin-bottom:18px;text-align:center;">
        <div style="font-size:21px;font-weight:700;margin-bottom:6px;">
          🍎 iPhone
        </div>

        <p style="margin:8px 0 18px;">
          Tap below on your iPhone to redeem your free month through Apple.
        </p>

        <a href="https://apps.apple.com/redeem?ctx=offercodes&id=6767086947&code=${PROMO_CODE}"
           style="display:inline-block;background:#f0a23a;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:8px;font-weight:700;">
          Claim My Free Month
        </a>

        <p style="font-size:14px;color:#777777;margin:16px 0 0;">
          Offer code: <strong>${PROMO_CODE}</strong>
        </p>
      </div>

      <div style="border:1px solid #e3e3e3;border-radius:12px;padding:24px;margin-bottom:30px;text-align:center;">
        <div style="font-size:21px;font-weight:700;margin-bottom:6px;">
          Android
        </div>

        <p style="margin:8px 0;">
          Open RYZR on your Android phone and select <strong>Premium Monthly</strong>.
        </p>

        <p style="margin:8px 0;">
          During checkout, choose <strong>Redeem code</strong> and enter:
        </p>

        <div style="font-size:28px;font-weight:800;letter-spacing:2px;margin:18px 0;color:#171717;">
          ${PROMO_CODE}
        </div>

        <div style="display:inline-block;background:#f0a23a;color:#ffffff;padding:12px 24px;border-radius:8px;font-weight:700;margin-bottom:12px;">
          30 Days Free
        </div>

        <p style="font-size:14px;color:#777777;line-height:1.5;margin:18px 0 0;">
          Google requires this custom subscription promo code to be redeemed during the RYZR subscription checkout.
        </p>
      </div>

      <div style="font-size:21px;font-weight:700;margin:30px 0 10px;">
        What Premium gives you
      </div>

      <p style="margin:8px 0;">• More personalized coaching and workout progression</p>
      <p style="margin:8px 0;">• Training adapted around your goals and available equipment</p>
      <p style="margin:8px 0;">• Help working around injuries and limitations</p>
      <p style="margin:8px 0;">• Coaching built around activities like surfing, hiking, running, and more</p>

      <p style="margin-top:28px;">
        Thanks again for trying RYZR — and especially for helping me make it better.
      </p>

      <p style="margin-top:28px;">
        <strong>Train for the life you want.</strong>
      </p>

      <p>
        Josh Perry<br>
        Founder, RYZR
      </p>

      <div style="margin-top:34px;padding-top:22px;border-top:1px solid #eeeeee;font-size:14px;color:#666666;line-height:1.55;">
        <strong>P.S.</strong> Every feature in RYZR started as someone's idea. If there's anything that frustrates you
        — or something you'd love to see — just hit Reply. I read every email personally.
      </div>

    </div>

    <div style="background:#171717;color:#999999;text-align:center;padding:26px;font-size:13px;line-height:1.6;">
      © 2026 RYZR<br>
      Bradik Enterprises<br><br>
      <a href="${UNSUBSCRIBE_MAILTO}" style="color:#bdbdbd;text-decoration:underline;">
        Unsubscribe
      </a>
    </div>

  </div>

</body>
</html>`;
}
