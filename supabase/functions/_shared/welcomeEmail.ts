// Single source of truth for the RYZR welcome email.
//
// Previously this markup was copy-pasted into both `send-ryzr-email` and
// `send-ryzr-welcome-batch`, so the two could drift apart. Every function that
// sends the welcome email now imports from here.

export const WELCOME_CAMPAIGN = 'ryzr-free-month-2026';

export const WELCOME_FROM = 'Josh Perry, Founder of RYZR <josh@bradikenterprises.com>';
export const WELCOME_REPLY_TO = 'josh@bradikenterprises.com';
export const WELCOME_SUBJECT = 'Welcome to RYZR — Your Free Month is Waiting';

/** Promo code shown in the email, redeemed via App Store offer codes / Play billing. */
export const PROMO_CODE = 'RYZR30';

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
  };
}

export function buildWelcomeEmail(rawFirstName: string): string {
  const firstName = escapeHtml(rawFirstName || 'there');

  return `
    <div style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">

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
            I'm Josh, the founder of RYZR. Thanks for downloading the app and giving it a try.
          </p>

          <p>
            I built RYZR because I wanted more than another workout app.
            I wanted a coach that adapts to your goals, your equipment,
            your recovery, and the things you actually want to be able to do in life.
          </p>

          <p>
            Whether that's surfing, hiking, running, getting stronger,
            or simply feeling better every day, that's what RYZR is built around.
          </p>

          <div style="margin:32px 0;padding:24px;background:#fafafa;border:1px solid #e8e8e8;border-radius:12px;">

            <div style="font-size:22px;font-weight:700;margin-bottom:12px;">
              I'd love your feedback
            </div>

            <p style="margin-bottom:10px;">
              Just hit Reply and tell me:
            </p>

            <p style="margin:6px 0;">
              • What's your favorite part of RYZR so far?
            </p>

            <p style="margin:6px 0;">
              • What's one thing you'd improve?
            </p>

            <p style="margin:6px 0;">
              • Is there anything you expected to find but couldn't?
            </p>

            <p style="margin-bottom:18px;">
              I personally read every response.
            </p>

            <a
              href="mailto:${WELCOME_REPLY_TO}?subject=RYZR%20Feedback"
              style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;"
            >
              Send Feedback
            </a>

          </div>

          <div style="text-align:center;margin:38px 0 18px;">

            <div style="font-size:27px;font-weight:800;">
              Your free month of Premium
            </div>

            <p style="margin:12px auto 24px;max-width:500px;">
              As a thank-you for being an early RYZR user,
              I'd like to give you one month of Premium free.
            </p>

          </div>

          <div style="border:1px solid #e3e3e3;border-radius:12px;padding:24px;margin-bottom:18px;text-align:center;">

            <div style="font-size:21px;font-weight:700;margin-bottom:6px;">
              🍎 iPhone
            </div>

            <p style="margin:8px 0 18px;">
              Tap below on your iPhone to redeem your free month through Apple.
            </p>

            <a
              href="https://apps.apple.com/redeem?ctx=offercodes&id=6767086947&code=${PROMO_CODE}"
              style="display:inline-block;background:#f0a23a;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:8px;font-weight:700;"
            >
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
              Open RYZR on your Android phone and select
              <strong>Premium Monthly</strong>.
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
              Google requires this custom subscription promo code
              to be redeemed during the RYZR subscription checkout.
            </p>

          </div>

          <div style="font-size:21px;font-weight:700;margin:30px 0 10px;">
            What Premium gives you
          </div>

          <p style="margin:8px 0;">
            • More personalized coaching and workout progression
          </p>

          <p style="margin:8px 0;">
            • Training adapted around your goals and available equipment
          </p>

          <p style="margin:8px 0;">
            • Help working around injuries and limitations
          </p>

          <p style="margin:8px 0;">
            • Coaching built around activities like surfing, hiking, running, and more
          </p>

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

        </div>

        <div style="background:#171717;color:#999999;text-align:center;padding:26px;font-size:13px;">
          © 2026 RYZR<br>
          Bradik Enterprises
        </div>

      </div>
    </div>
  `;
}
