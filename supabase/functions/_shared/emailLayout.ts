// The branded shell every RYZR lifecycle email renders inside.
//
// Extracted from the welcome email so the drip stages can't drift from it
// visually. Only the body content differs between stages.

export const WELCOME_FROM = 'Josh Perry, Founder of RYZR <josh@bradikenterprises.com>';
export const WELCOME_REPLY_TO = 'josh@bradikenterprises.com';

/**
 * Transactional sends get no hosted unsubscribe URL from Resend (that is a
 * Broadcast feature), so this is honoured by hand. See the unsubscribe note in
 * docs/welcome-email-automation.md.
 */
export const UNSUBSCRIBE_MAILTO =
  'mailto:josh@bradikenterprises.com?subject=Unsubscribe';

/** Display names come from user-supplied signup metadata — never interpolate raw. */
export function escapeHtml(value: string): string {
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

  const candidates = [meta.first_name, meta.firstName, meta.name, meta.full_name];

  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const first = candidate.trim().split(/\s+/)[0];
    if (first) return first;
  }

  return 'there';
}

/** Standard "just hit reply" CTA button. */
export function feedbackButton(label = 'Send Feedback', subject = 'RYZR Feedback'): string {
  return `
        <a href="mailto:${WELCOME_REPLY_TO}?subject=${encodeURIComponent(subject)}"
           style="display:inline-block;background:#171717;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:700;">
          ${escapeHtml(label)}
        </a>`;
}

/** A bordered callout card, used for feature highlights across the sequence. */
export function card(heading: string, bodyHtml: string): string {
  return `
      <div style="border:1px solid #e3e3e3;border-radius:12px;padding:24px;margin-bottom:18px;">
        <div style="font-size:21px;font-weight:700;margin-bottom:8px;">
          ${escapeHtml(heading)}
        </div>
        ${bodyHtml}
      </div>`;
}

export interface EmailShell {
  /** Browser/base title. */
  title: string;
  /** Inbox preview line, hidden in the body. */
  preheader: string;
  /** Inner HTML for the white content column. */
  body: string;
}

export function renderEmail({ title, preheader, body }: EmailShell): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">

  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    ${escapeHtml(preheader)}
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
${body}
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
