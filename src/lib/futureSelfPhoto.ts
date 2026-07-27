// "Future You" photo reshape — turns the app's own projected body-fat / muscle
// trend into Perfect Corp (YouCam) AI Body Reshape parameters, then runs the
// reshape server-side via the `future-self-reshape` edge function.
//
// IMPORTANT — honesty guardrails:
//  - This warps a real full-body photo (slims waist/belly, tapers limbs,
//    widens shoulders). It does NOT render muscle definition, and it is a
//    stylized projection, not a promise. Gate it behind the same consent +
//    "illustration, not a guarantee" framing as the silhouette, and behind
//    isPremium.
//  - Intensities are derived from the user's OWN projected trend
//    (projectBodyFatOutlook) and clamped, so the render reflects a realistic
//    delta rather than a fantasy physique.

import { supabase } from './supabase';

/** Perfect Corp reshape features. Intensities are ints; see the API's ranges. */
export interface ReshapeFeatures {
  waist?: number; // -100..100 (negative = narrower)
  belly?: number; // -100..100 (negative = flatter)
  slim?: number; // -100..100 (negative = slimmer overall)
  arm?: number; // -100..100 (negative = thinner)
  leg?: number; // -100..100 (negative = thinner)
  shoulder_left?: number; // -100..100 (positive = broader)
  shoulder_right?: number;
  squared_shoulder_left?: number; // -100..100 (positive = squarer)
  squared_shoulder_right?: number;
  hip?: number; // -100..100
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));

/**
 * Maps a projected body-fat reduction (points) and muscle-development gain
 * (0..1) into reshape intensities. Fat loss narrows the waist/belly and slims
 * the frame; a muscle-building goal broadens and squares the shoulders and
 * keeps limbs fuller. Everything is clamped to stay believable — this is a
 * motivational projection, never a maxed-out "shredded" preset.
 */
export function reshapeFeaturesFromProjection(opts: {
  goal?: string;
  fatDeltaPct: number; // currentBf - projectedBf (positive = fat lost)
  muscleDelta01?: number; // projected muscle - current muscle, 0..1
}): ReshapeFeatures {
  const { goal, fatDeltaPct, muscleDelta01 = 0 } = opts;
  const building = goal === 'build_muscle';

  const fatK = clamp(Math.max(0, fatDeltaPct) * 7, 0, 60);
  const muscleJ = clamp(Math.max(0, muscleDelta01) * 120, 0, 40);

  const features: ReshapeFeatures = {
    waist: -clamp(fatK + muscleJ * 0.3, 0, 70),
    belly: -clamp(fatK * 1.2, 0, 70),
    slim: -clamp(fatK * 0.9, 0, 60),
    arm: building ? clamp(muscleJ * 0.3, 0, 25) : -clamp(fatK * 0.35, 0, 30),
    leg: building ? clamp(muscleJ * 0.2, 0, 20) : -clamp(fatK * 0.35, 0, 30),
    shoulder_left: clamp(muscleJ, 0, 40),
    shoulder_right: clamp(muscleJ, 0, 40),
    squared_shoulder_left: clamp(muscleJ * 0.6, 0, 30),
    squared_shoulder_right: clamp(muscleJ * 0.6, 0, 30),
  };

  // The API rejects an all-zero effect — fall back to a gentle slim if the
  // projection produced nothing (e.g. no meaningful trend yet).
  if (Object.values(features).every((v) => !v)) {
    return { waist: -15, belly: -25, slim: -30 };
  }

  // Drop zero entries to keep the payload tidy.
  return Object.fromEntries(Object.entries(features).filter(([, v]) => v)) as ReshapeFeatures;
}

export interface ReshapeResult {
  status: 'success' | 'error';
  imageUrl?: string;
  taskId?: string;
  error?: string;
  raw?: unknown;
}

/** Pulls the first result image URL out of the (loosely documented) payload. */
function extractImageUrl(results: unknown): string | undefined {
  if (!results) return undefined;
  const arr = Array.isArray(results) ? results : [results];
  for (const r of arr) {
    if (typeof r === 'string' && r.startsWith('http')) return r;
    if (r && typeof r === 'object') {
      const o = r as Record<string, unknown>;
      for (const k of ['url', 'file_url', 'dst_url', 'image_url']) {
        if (typeof o[k] === 'string') return o[k] as string;
      }
    }
  }
  return undefined;
}

/**
 * Runs the reshape on a full-body selfie (base64, as returned by
 * expo-image-picker). The edge function stashes it in a private bucket, hands
 * Perfect Corp a short-lived signed URL, and deletes the input again — the
 * photo is never made public. Returns the reshaped image URL, or an error.
 * Premium + consent gating is the caller's responsibility.
 */
export async function generatePhysiquePreview(
  imageBase64: string,
  features: ReshapeFeatures
): Promise<ReshapeResult> {
  const { data, error } = await supabase.functions.invoke('future-self-reshape', {
    body: { image_base64: imageBase64, features },
  });
  if (error) return { status: 'error', error: error.message };
  if (data?.error || data?.status === 'error') {
    return { status: 'error', error: data.error ?? 'Reshape failed', raw: data };
  }
  return {
    status: 'success',
    imageUrl: extractImageUrl(data?.results),
    taskId: data?.task_id,
    raw: data,
  };
}
