// ─────────────────────────────────────────────────────────────────────────────
// ONBOARDING FUNNEL INSTRUMENTATION
//
// Answers one question: where do people fall out between installing RYZR and
// actually training? Every step from first launch to first plan emits an event.
//
// Two sinks, on purpose:
//   • Supabase `funnel_events` — the queryable copy we own. Use this to build
//     the funnel report (see docs/funnel-events.md).
//   • Meta app events — lets ad campaigns optimize toward people who actually
//     activate, not merely install.
//
// Every call is fire-and-forget and swallows its own errors. Analytics must
// never break a screen, and must never block navigation.
//
// Pre-signup steps have no user_id, so events are keyed by an anonymous
// per-install device id. Once the user signs up, their events carry BOTH ids —
// that overlap is what lets you stitch an install to an account and measure
// signup drop-off honestly.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { supabase } from './supabase';

export type FunnelStep =
  // Pre-auth
  | 'intro_viewed'
  | 'intro_skipped'
  | 'intro_completed'
  | 'auth_welcome_viewed'
  | 'signup_viewed'
  | 'signup_submitted'
  | 'signup_completed'
  | 'login_completed'
  // Onboarding questionnaire
  | 'onboarding_basics_viewed'
  | 'onboarding_injuries_viewed'
  | 'onboarding_schedule_viewed'
  | 'onboarding_equipment_viewed'
  | 'onboarding_goals_viewed'
  // Paywall
  | 'paywall_viewed'
  | 'paywall_start_free'
  | 'paywall_purchased'
  | 'paywall_restored'
  | 'paywall_skipped_already_premium'
  // Payoff
  | 'plan_generation_started'
  | 'plan_ready'
  | 'plan_generation_failed'
  | 'activated_home_viewed';

const DEVICE_ID_KEY = 'ryzr_anon_device_id';

let cachedDeviceId: string | null = null;
/** Steps already sent this launch — keeps screen re-mounts from inflating counts. */
const sentThisSession = new Set<FunnelStep>();

function randomId(): string {
  return [
    Date.now().toString(36),
    Math.random().toString(36).slice(2, 10),
    Math.random().toString(36).slice(2, 10),
  ].join('-');
}

/** Stable per-install id so pre-signup steps can be tied to the same person. */
async function getDeviceId(): Promise<string> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    let id = await SecureStore.getItemAsync(DEVICE_ID_KEY);
    if (!id) {
      id = randomId();
      await SecureStore.setItemAsync(DEVICE_ID_KEY, id);
    }
    cachedDeviceId = id;
  } catch {
    // SecureStore unavailable — an in-memory id still keeps this launch
    // internally consistent, which is enough to see step-to-step drop-off.
    cachedDeviceId = cachedDeviceId ?? randomId();
  }
  return cachedDeviceId;
}

/**
 * Record one funnel step.
 *
 * @param step  the funnel position reached
 * @param props optional small scalar context (kept flat — it lands in a jsonb column)
 * @param once  when true (default) the step is only sent once per app launch
 */
export function logFunnelStep(
  step: FunnelStep,
  props?: Record<string, string | number | boolean>,
  once = true,
): void {
  if (once) {
    if (sentThisSession.has(step)) return;
    sentThisSession.add(step);
  }

  // Deliberately not awaited — callers are render paths and tap handlers.
  void (async () => {
    try {
      const [device_id, sessionRes] = await Promise.all([
        getDeviceId(),
        supabase.auth.getSession().catch(() => null),
      ]);

      await supabase.from('funnel_events').insert({
        device_id,
        user_id: sessionRes?.data?.session?.user?.id ?? null,
        step,
        platform: Platform.OS,
        app_version: Constants.expoConfig?.version ?? null,
        props: props ?? null,
      });
    } catch {
      // Never surface analytics failures to the user.
    }

    try {
      // Loaded lazily: on a build without the Meta SDK linked, importing at
      // module scope would take the whole screen down with it.
      const { AppEventsLogger } = require('react-native-fbsdk-next');
      AppEventsLogger.logEvent(`ryzr_${step}`, props ?? {});
    } catch {
      // Meta SDK absent or not initialized — the Supabase copy still landed.
    }
  })();
}

/** Log a step once when a screen mounts. */
export function useFunnelStep(
  step: FunnelStep,
  props?: Record<string, string | number | boolean>,
): void {
  useEffect(() => {
    logFunnelStep(step, props);
    // Intentionally mount-only: this measures "reached this screen", and
    // re-running on prop changes would double-count the same arrival.
  }, []);
}
