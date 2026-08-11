// Day 1 of the RYZR lifecycle sequence: the welcome email.
//
// Sent by the auth.users trigger via send-welcome-email. Later stages live in
// dripEmails.ts; the branded shell both share lives in emailLayout.ts.
//
// The copy comes from the Resend Broadcast version of this email. Two
// Broadcast-only merge tags had to be translated, because they are expanded by
// Resend's Broadcast pipeline and NOT by the transactional send API — pasted
// verbatim they reach the recipient as literal `{{{...}}}` text:
//
//   {{{contact.first_name|there}}} -> interpolated here from signup metadata
//   {{{RESEND_UNSUBSCRIBE_URL}}}   -> a mailto: unsubscribe (see emailLayout.ts)

import {
  escapeHtml,
  renderEmail,
  UNSUBSCRIBE_MAILTO,
  WELCOME_FROM,
  WELCOME_REPLY_TO,
} from './emailLayout.ts';

// Re-exported so existing importers of this module keep working unchanged.
export {
  resolveFirstName,
  UNSUBSCRIBE_MAILTO,
  WELCOME_FROM,
  WELCOME_REPLY_TO,
} from './emailLayout.ts';

export const WELCOME_CAMPAIGN = 'ryzr-free-month-2026';
export const WELCOME_SUBJECT = 'Welcome to RYZR — Your Free Month is Waiting';

/** Promo code shown in the email, redeemed via App Store offer codes / Play billing. */
export const PROMO_CODE = 'RYZR30';

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

  return renderEmail({
    title: 'RYZR — Your Free Month is Waiting',
    preheader: "Thanks for trying RYZR. I'd love your feedback — and here's a free month of Premium.",
    body: `
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
      </div>`,
  });
}
