// MoveNet-over-TFLite pose source.
//
// This is the detector the app actually uses. It is built from three pieces
// that are all maintained against VisionCamera 4 + react-native-worklets-core:
//
//   react-native-fast-tflite      runs the model (same author as VisionCamera,
//                                 so worklet interop is a supported path
//                                 rather than a lucky one)
//   vision-camera-resize-plugin   frame → RGB uint8, inside the worklet
//   assets/models/movenet_lightning.tflite
//
// Deliberately NOT used: the community ML Kit pose plugins. The only one
// advertising VisionCamera 4 support was last published in July 2024 and is a
// fork of an abandoned v3 package — two years stale, predating this app's
// React Native and New Architecture versions.
//
// Also deliberately not used: VisionCamera 5 and fast-tflite 3, which are the
// current releases but need react-native-worklets, which needs React Native
// 0.83+. This app is on 0.81 / Expo SDK 54, so those need an SDK upgrade
// first — see docs/form-coach.md.

import { useEffect, useMemo, useState } from 'react';

/** Minimal shapes we need; avoids importing optional native modules' types. */
export interface TfliteModel {
  runSync: (inputs: unknown[]) => unknown[];
}
export type ResizeFn = (frame: unknown, options: unknown) => ArrayLike<number>;

export type TflitePoseStatus =
  | 'ready'
  | 'loading'
  | 'unavailable'  // native modules not in this binary
  | 'error';

export interface TflitePoseSource {
  status: TflitePoseStatus;
  /** Set only when status === 'ready'. Safe to call from a worklet. */
  model: TfliteModel | null;
  /** Set only when status === 'ready'. Safe to call from a worklet. */
  resize: ResizeFn | null;
  /** Human-readable reason, for the debug strip and the mode notice. */
  detail: string | null;
}

const UNAVAILABLE: TflitePoseSource = {
  status: 'unavailable',
  model: null,
  resize: null,
  detail: 'On-device pose modules are not in this build.',
};

/**
 * Resolve the resize plugin.
 *
 * Uses `createResizePlugin()` rather than the package's `useResizePlugin()`
 * hook on purpose: the hook cannot be called conditionally, and whether these
 * optional native modules exist is exactly the condition we need to branch
 * on. The non-hook factory keeps hook order stable in every build.
 */
function loadResize(): ResizeFn | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('vision-camera-resize-plugin');
    const plugin = mod?.createResizePlugin?.();
    return plugin?.resize ?? null;
  } catch {
    return null;
  }
}

function loadTflite(): { loadTensorflowModel: (src: unknown) => Promise<TfliteModel> } | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-fast-tflite');
    return mod?.loadTensorflowModel ? mod : null;
  } catch {
    return null;
  }
}

/**
 * Load MoveNet and the resize plugin.
 *
 * Every failure mode resolves to a status rather than throwing: a missing
 * native module, a missing model asset and a corrupt model must all degrade
 * to the snapshot fallback, never crash the Form Coach on mount.
 */
export function useTflitePose(enabled: boolean): TflitePoseSource {
  const deps = useMemo(() => {
    const tflite = loadTflite();
    const resize = loadResize();
    return tflite && resize ? { tflite, resize } : null;
  }, []);

  const [model, setModel] = useState<TfliteModel | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deps || !enabled || model) return;
    let cancelled = false;

    (async () => {
      try {
        const asset = require('../../../assets/models/movenet_lightning.tflite');
        const loaded = await deps.tflite.loadTensorflowModel(asset);
        if (!cancelled) setModel(loaded);
      } catch (e) {
        if (!cancelled) setError((e as Error)?.message ?? 'failed to load MoveNet');
      }
    })();

    return () => { cancelled = true; };
  }, [deps, enabled, model]);

  if (!deps) return UNAVAILABLE;
  if (error) return { status: 'error', model: null, resize: null, detail: error };
  if (!model) {
    return {
      status: enabled ? 'loading' : 'unavailable',
      model: null,
      resize: null,
      detail: enabled ? 'Loading pose model…' : null,
    };
  }
  return { status: 'ready', model, resize: deps.resize, detail: null };
}
