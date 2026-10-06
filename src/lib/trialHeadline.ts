// Copy for the "free trial" line shown at the top of Store → Membership when a
// premium feature sent the user there. Pure (no React Native imports) so it can
// be unit tested with `npm run test:trial`.
//
// `source` is the feature name the gate passed to useOpenMembership. Gates we
// have no friendly name for (browsing the Store, the Today upgrade banner) get
// the generic "Premium" wording.

const FEATURE_NAMES: Record<string, string> = {
  'AI Coach Chat': 'AI Coach Chat',
  'Unlimited Plan Regeneration': 'unlimited plan regeneration',
  'Custom AI Workout Plans': 'custom AI workout plans',
  'AI Meal Logging': 'AI meal logging',
  'Coach Voice': 'coach voices',
};

/** e.g. "Try AI Coach Chat free for 7 days" */
export function trialHeadline(source: string | undefined, duration: string): string {
  const feature = source ? FEATURE_NAMES[source] : undefined;
  return `Try ${feature ?? 'Premium'} free for ${duration}`;
}
