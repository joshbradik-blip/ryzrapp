import { Platform, Linking } from 'react-native';
import * as StoreReview from 'expo-store-review';
import Constants from 'expo-constants';
import { useReviewStore } from '../store/reviewStore';
import { useHistoryStore } from '../store/historyStore';
import { APP_STORE_URL, PLAY_STORE_URL } from './referrals';

export const SUPPORT_EMAIL = 'support@ryzrapp.com';

/** Completed workouts before we'd even consider asking. */
const MIN_SESSIONS = 3;
/** Days since first launch before we'd consider asking. */
const MIN_DAYS_INSTALLED = 3;
/** Days to wait after a soft-ask before trying again. */
const COOLDOWN_DAYS = 60;
/** Apple only surfaces the native prompt ~3x/year, so never spend more than that. */
const MAX_PROMPTS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysSince = (iso: string | null): number =>
  iso === null ? Infinity : (Date.now() - new Date(iso).getTime()) / DAY_MS;

/**
 * Whether the "Enjoying RYZR?" sheet should be shown right now.
 *
 * Deliberately conservative: a review prompt is a one-shot resource (iOS
 * silently swallows extra calls), so we only spend it on someone who has
 * actually stuck with the app and just finished a workout.
 *
 * Side effect: starts the install clock the first time it's called.
 */
export function shouldAskForReview(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;

  const review = useReviewStore.getState();
  review.markSeen();

  if (review.optedOut) return false;
  if (review.promptCount >= MAX_PROMPTS) return false;
  if (daysSince(review.firstSeenAt) < MIN_DAYS_INSTALLED) return false;
  if (daysSince(review.lastPromptedAt) < COOLDOWN_DAYS) return false;
  if (useHistoryStore.getState().totalSessions < MIN_SESSIONS) return false;

  return true;
}

/** The platform's store listing, used when the in-app prompt isn't available. */
export const storeListingUrl = (): string =>
  Platform.OS === 'android' ? PLAY_STORE_URL : APP_STORE_URL;

/**
 * Ask for a rating. Prefers the native in-app prompt (no app switch, and the
 * only path that can post a review without leaving RYZR); falls back to the
 * store listing with the review sheet pre-opened.
 *
 * The native prompt gives no signal about what the user did — by design — so
 * callers should treat a resolved promise as "asked", not "rated".
 */
export async function requestReview(): Promise<void> {
  try {
    if ((await StoreReview.hasAction()) && (await StoreReview.isAvailableAsync())) {
      await StoreReview.requestReview();
      return;
    }
  } catch {
    // fall through to the store listing
  }
  await openStoreListing();
}

/** Open the store listing directly, with the write-a-review sheet where supported. */
export async function openStoreListing(): Promise<void> {
  const url =
    Platform.OS === 'ios' ? `${APP_STORE_URL}?action=write-review` : PLAY_STORE_URL;
  try {
    await Linking.openURL(url);
  } catch {
    // nothing sensible to do if the store app is missing
  }
}

/**
 * Open the mail composer prefilled for support. Version and platform go in the
 * body so a bug report arrives with the context we'd otherwise have to ask for.
 */
export async function emailFeedback(): Promise<void> {
  const version = Constants.expoConfig?.version ?? 'unknown';
  const build =
    (Platform.OS === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : String(Constants.expoConfig?.android?.versionCode ?? '')) || '—';

  const subject = `RYZR feedback (v${version})`;
  const body = [
    'What could we do better?',
    '',
    '',
    '---',
    `App: RYZR ${version} (${build})`,
    `Platform: ${Platform.OS} ${Platform.Version}`,
  ].join('\n');

  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  try {
    await Linking.openURL(url);
  } catch {
    // no mail client configured — the sheet has already thanked them
  }
}
