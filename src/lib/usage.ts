// Claude API usage + cost telemetry.
//
// Every call goes through callAnthropic/callWorkoutCoach in lib/anthropic.ts,
// which reports the `usage` block Anthropic returns. This turns that into a
// row in the Supabase `api_usage` table so real per-feature cost can be read
// off the dashboard instead of estimated from max_tokens.
//
// Logging is strictly fire-and-forget: a failed insert must never break the
// feature the user is actually using. Nothing here throws or blocks.
//
// Trust note: these rows are written by the client, which knows which feature
// made the call — the proxy only sees a model and a message array. That means
// a determined user could forge a row. This is owner-facing cost telemetry,
// not billing, so that tradeoff is deliberate; don't build anything that
// charges money off this table without moving the write into the edge
// function.

import { supabase } from './supabase';
import { costOf, type AnthropicUsage } from './usageCost';

export { costOf, type AnthropicUsage };

/**
 * Record one call. Never throws, never blocks — callers do not await it.
 *
 * `feature` is the label the dashboard groups by, so keep the strings stable:
 * renaming one splits its history in two.
 */
export function logUsage(feature: string, model: string, usage: AnthropicUsage | undefined): void {
  if (!usage) return; // nothing to record — don't write a row of zeros
  void (async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      await supabase.from('api_usage').insert({
        user_id: user?.id ?? null,
        feature,
        model,
        input_tokens: usage.input_tokens ?? 0,
        output_tokens: usage.output_tokens ?? 0,
        cache_read_tokens: usage.cache_read_input_tokens ?? 0,
        cache_write_tokens: usage.cache_creation_input_tokens ?? 0,
        cost_usd: costOf(model, usage),
      });
    } catch {
      // Telemetry is never worth surfacing to the user.
    }
  })();
}
