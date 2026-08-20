// ─────────────────────────────────────────────────────────────────────────────
// Free-trial detection, read live off the RevenueCat package.
//
// Nothing here hardcodes "3 days". The trial length comes from the introductory
// offer configured in App Store Connect / Play Console, so changing it there
// changes every paywall without a code change — and a build made before the
// offer exists simply shows the normal pricing instead of promising a trial
// the store won't honour.
// ─────────────────────────────────────────────────────────────────────────────
import { PurchasesPackage } from 'react-native-purchases';

export interface FreeTrial {
  /** e.g. 3 */
  count: number;
  /** DAY | WEEK | MONTH | YEAR, as the store reports it. */
  unit: string;
  /** Sentence-ready duration, e.g. "3 days". */
  duration: string;
  /** Adjective form for headlines, e.g. "3-day". */
  adjective: string;
}

const UNIT_NOUN: Record<string, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
};

/**
 * The package's introductory offer, but only when it is actually *free*.
 *
 * RevenueCat reports discounted intro offers through the same field, and a
 * half-price first month is not a trial — calling it one in the UI would be a
 * misrepresentation at the point of purchase.
 */
export function getFreeTrial(pkg?: PurchasesPackage | null): FreeTrial | null {
  const intro = pkg?.product?.introPrice;
  if (!intro) return null;
  if (intro.price !== 0) return null;

  const cycles = intro.cycles > 0 ? intro.cycles : 1;
  const count = intro.periodNumberOfUnits * cycles;
  if (count <= 0) return null;

  const unit = (intro.periodUnit ?? '').toUpperCase();
  const noun = UNIT_NOUN[unit] ?? 'day';

  return {
    count,
    unit,
    duration: `${count} ${noun}${count === 1 ? '' : 's'}`,
    adjective: `${count}-${noun}`,
  };
}

/** "3 DAYS FREE" — the badge sitting on a plan card. */
export function trialBadgeText(trial: FreeTrial): string {
  return `${trial.duration.toUpperCase()} FREE`;
}

/**
 * The line directly under a plan's price, e.g.
 * "3 days free, then $14.99/mo · cancel anytime".
 *
 * Apple 3.1.2 wants the trial length, the fact that it converts, and the price
 * it converts to, all visible at the point of purchase — this carries all three.
 */
export function trialPriceLine(trial: FreeTrial, priceString: string, per: string): string {
  return `${trial.duration} free, then ${priceString}/${per} · cancel anytime`;
}
