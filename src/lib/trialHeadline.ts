// Copy for the free-trial wording, kept pure (no React Native imports) so it can
// be unit tested with `npm run test:trial`. Wording is generic on purpose: it
// does not name the feature the user tapped.

/** Top of Store → Membership, e.g. "Try Premium free for 1 week". */
export function trialHeadline(duration: string): string {
  return `Try Premium free for ${duration}`;
}

/**
 * The small prompt shown when a free user taps a premium feature. It never
 * navigates by itself: the user taps `action` to open Membership, or dismisses.
 * `duration` is only passed when the store really has a free trial configured,
 * so nothing is promised otherwise.
 */
export function premiumPromptCopy(duration?: string): { title: string; message: string; action: string } {
  return {
    title: 'Premium feature',
    message: duration
      ? `This is part of RYZR Premium. Try it free for ${duration}.`
      : 'This is part of RYZR Premium.',
    action: 'View Premium',
  };
}
