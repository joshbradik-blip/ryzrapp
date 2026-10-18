// Claude API cost arithmetic. Pure TypeScript, no imports, no RN — so it can
// be unit-tested with `npm run test:usage` the same way src/lib/pose/ is.
//
// The dollar figures on the usage dashboard are only as right as this file.

/**
 * USD per million tokens, per model. Keep in step with the published pricing
 * at platform.claude.com/docs — a stale rate here silently skews every cost
 * figure, and nothing will fail loudly to tell you.
 *
 * Verified 2026-10-18.
 */
export const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
  'claude-haiku-4-5': { input: 1, output: 5 },
};

/** Cached input is billed at ~0.1x the input rate; writing to cache at ~1.25x. */
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

/** The `usage` block Anthropic returns. Older responses omit the cache fields. */
export interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

/**
 * Dollar cost of one API call.
 *
 * Returns null for a model that is not priced above, rather than guessing or
 * returning 0 — on the dashboard an unpriced call must read as unknown, never
 * as free, or a model swap would silently look like the bill went to zero.
 */
export function costOf(model: string, usage: AnthropicUsage): number | null {
  const rate = PRICING[model];
  if (!rate) return null;

  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheWrite = usage.cache_creation_input_tokens ?? 0;

  return (
    (input * rate.input +
      cacheRead * rate.input * CACHE_READ_MULTIPLIER +
      cacheWrite * rate.input * CACHE_WRITE_MULTIPLIER +
      output * rate.output) /
    1_000_000
  );
}
