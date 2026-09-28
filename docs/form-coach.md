# Form Coach — architecture

## Why this was rebuilt

The original Form Coach took a JPEG every two seconds, sent it to a vision
model, and asked it to classify the body as `ready` / `mid` / `contracted`.
Reps were counted from transitions between those labels.

That design is why it needed studio conditions:

- **A still frame has no motion.** The model had to infer a phase of movement
  from a single image, with no velocity and no history. Ambiguous frames were
  coin flips.
- **0.5 fps misses reps.** A two-second sampling interval is slower than a
  rep. Fast sets were undercounted no matter how good the model was.
- **One bad frame = one bad rep.** There was no smoothing or voting, so a
  single misclassification silently added or dropped a count.
- **Failure was silent.** Bad light produced `Can't see you clearly` and a
  frozen counter. The user was never told whether to move, turn, or add light.
- **One fixed framing rule for every exercise.** "Stand 6–10 feet away, full
  body in frame" was applied to bicep curls as well as squats, even though a
  curl only needs a shoulder, an elbow and a wrist.

Every one of those is a property of the *sensing layer*, not of the prompt.

## The current design

Sensing moved on-device, to pose keypoints. Claude moved up a level, from
looking at pixels to coaching on measurements.

```
camera frame
   ↓ (resize → MoveNet via TFLite, 15fps, all on device)
17 pose keypoints  →  decodeMoveNet()
   ↓
framing.ts       — can I track THIS exercise right now? if not, what should the user change?
   ↓ (trackable only)
repDetector.ts   — One Euro filter → normalized depth → hysteresis state machine → RepEvent
   ↓
formRules.ts     — deterministic per-rep checks, scale-normalized, instant, no network
   ↓
session.ts       — throttling, scoring, summary
   ↓ (once, at end of set)
summarizeSetForCoach()  — Claude coaches on the numbers, not on an image
```

### What each piece fixes

| Old failure | Fix |
|---|---|
| Single-frame guessing | `repDetector.ts` — a rep is a *trajectory* (down past threshold, back up, enough ROM, plausible duration), not a snapshot |
| Jitter in poor light | `filter.ts` — One Euro filter smooths hard when still, barely at all when moving, so noise never reads as movement |
| 0.5 fps | Frame processor runs at camera rate on-device, no network in the loop |
| Silent failure | `framing.ts` returns a specific, speakable instruction *and* whether it is blocking |
| Fixed 6-foot framing | Per-exercise `requiredJoints` + a **fallback angle source** |
| Harsh depth gating | Counter is permissive (`BOTTOM_ENTER = 0.6`); the *score* judges depth, not the counter |

### The fallback angle source

This is the main reason the distance requirement is gone. A squat is measured
on knee angle (hip–knee–ankle), which needs the ankles in shot. If the ankles
are not visible, the profile falls back to **hip angle** (shoulder–hip–knee),
which describes the same descent and needs no ankles.

So a squat tracks from hips and knees alone — phone on the floor, close range,
feet out of frame. `framing.ts` only reports a joint as "missing" when *no*
angle source can be satisfied.

The chosen source is **latched for the whole set**: switching between two
differently-scaled angles mid-rep would step the depth signal and fabricate a
rep out of nothing.

### Scale normalization

Every threshold that could depend on distance is divided by `torsoScale()`
(shoulder-to-hip distance) first. The same rule therefore fires identically at
two feet and at ten. Checks that could depend on camera mirroring (knee
valgus) compare *separations* rather than absolute left/right positions.

## Testing

The whole pipeline is free of React Native imports specifically so it can be
tested without a device:

```
npm run test:pose
```

Tests drive synthetic skeletons through the real code — clean reps, shallow
partials, bounces, jitter while standing still, mid-rep occlusion, missing
ankles, darkness, cropped joints, and each form rule.

`useFormCoach.ts` and `nativePose.ts` are the only React-Native-aware files in
`src/lib/pose/`, and they contain no decision logic.

## The detector

`useFormCoach` picks the best tracker the build has, in this order:

1. **Platform tracker** — our own frame processor plugin `ryzrPose`
   (`modules/ryzr-pose`, autolinked as a local Expo module):
   - iOS: Apple Vision `VNDetectHumanBodyPoseRequest`. System framework, adds
     nothing to the download.
   - Android: Google ML Kit Pose Detection in stream mode, with the base model
     bundled in the APK. Adds heels and feet on top of the 17 body points.
   Both are better than MoveNet Lightning in dim light and side-on views, which
   is where most Form Coach sets are filmed.
2. **MoveNet Lightning over TFLite** (below), if the plugin is missing from the
   binary, if the `form_coach_native_tracker` flag is off, or if the plugin
   fails 30 frames in a row on a device.
3. **Snapshot "Basic mode"**, if neither can run.

The plugin returns pixels in the upright image; `nativePoseToFrame()` converts
them into the same coordinate space MoveNet produces, so nothing downstream
knows or cares which tracker ran.

**Every function a frame processor calls must be a `'worklet'`.** Frame
processors run on a separate JS runtime where calling a plain function
throws, and the frame processor's `try/catch` swallows it — the Form Coach then
looks live but tracks nothing. That is exactly what happened to the MoveNet
helpers until they were marked; `pose.test.ts` now fails if the directive goes
missing.

### MoveNet

The fallback tracker is **MoveNet SinglePose Lightning** run through TFLite:

| Piece | Version | Role |
|---|---|---|
| `react-native-fast-tflite` | `^1.6.1` | runs the model |
| `vision-camera-resize-plugin` | `^3.2.0` | frame → RGB uint8, inside the worklet |
| `assets/models/movenet_lightning.tflite` | — | 1×192×192×3 float32 in, 1×1×17×3 out |

MoveNet's 17 COCO keypoints are exactly the landmark set the pipeline expects.

### Why these versions and not the newest

VisionCamera **5.2.3** and `fast-tflite` **3.x** are the current releases, and
neither is usable here yet: both need `react-native-worklets`, which declares
`react-native: 0.83 - 0.87`. This app is on **RN 0.81 / Expo SDK 54**, so
moving to them requires an Expo SDK upgrade first. Until then the pinned
versions above are the ones that pair with VisionCamera 4 + `worklets-core`.

The community ML Kit pose plugins were rejected: the only one advertising
VisionCamera 4 support was last published in **July 2024** and is a fork of an
abandoned v3 package — two years stale, predating this app's RN and New
Architecture versions.

### Three details that are easy to get silently wrong

1. **`uint8`, not `float32`.** The resize plugin's `float32` output is
   `0.0..1.0`, but this MoveNet variant expects `0..255`. Feeding it a 0..1
   tensor yields confident nonsense rather than an obvious failure, so we ask
   for `uint8` (unambiguously 0..255) and widen to float ourselves.

2. **Letterbox, not squash or crop.** Omitting `crop` makes the plugin
   centre-crop to a square, throwing away the top and bottom of a portrait
   frame — the exact field of view a squat needs. Squashing instead distorts
   the person and costs keypoint accuracy. We pass an explicit full-frame crop,
   scale to an aspect-preserving size, and pad to the square ourselves; the
   padding is then undone at decode, so a keypoint on the padding maps outside
   0..1 and reads as "cropped out of frame".

3. **Rotation.** VisionCamera delivers frames in *sensor* orientation, which
   on most Android devices is landscape even when the phone is held portrait.
   Unrotated, the person is lying on their side: joint angles still look
   plausible while torso lean, hip sag and the framing box are all wrong.
   `orientationToRotation()` maps `frame.orientation` to the rotation that
   brings the frame upright.

Landmarks come back with `y` in `0..1` and `x` in `0..aspect` (reported as
`PoseFrame.xMax`) so both axes share a scale. Without that, a physical 90°
elbow on a 16:9 frame decodes as about 62°.

The detector is throttled to **15fps**. Rep phases last hundreds of
milliseconds, so nothing is lost, and it roughly halves inference cost over a
workout.

## Turning it off remotely

The Form Coach has a remote off switch: the `form_coach_enabled` row in the
Supabase `app_config` table (`src/lib/featureFlags.ts`). Set it to `false` in
the dashboard and, on next launch or return to foreground, every install hides
the Form Coach buttons and removes it from the paywall, Store, Welcome and
onboarding copy. Set it back to `true` to restore it. No build or OTA update is
involved. If the table can't be reached, each device keeps the last value it
saw (default: on).

A second row, `form_coach_native_tracker`, chooses the tracker: `false` forces
MoveNet everywhere, in case the platform tracker misbehaves on some devices.

## Shipping it

The pose modules are **native** — this cannot go out over EAS Update / OTA.

```
npm install
npx expo prebuild --clean
eas build --profile development --platform ios   # or android
```

`app.json` already sets `enableFrameProcessors: true`, and `metro.config.js`
already lists `tflite` in `assetExts`.

If the native modules are missing from a build, `useTflitePose()` reports
`unavailable` and the screen falls back to the legacy snapshot path, labelled
"Basic mode" — so an OTA JS update never leaves an older binary with no Form
Coach at all.

### Verify on device

The pure logic is unit-tested, but three things can only be confirmed on real
hardware:

0. **Which tracker is running.** In a development build the status pill shows
   `NATIVE` (the platform tracker) or `MOVENET`, plus the frame rate.
1. **Orientation.** Stand upright in frame. If the framing coach insists you
   are out of frame while you are plainly centred, or torso-lean cues fire on
   a clean rep, the rotation mapping is off for that device — adjust
   `orientationToRotation()`.
2. **The model loads.** The start screen shows "Warming up on-device tracking…"
   briefly and then the Start button; if it stays on "Basic mode — pose model
   didn't load", the detail text carries the reason.
3. **Frame rate.** The tracking pill should sit near 15fps. Much lower means
   inference is not keeping up and `TARGET_FPS` should come down.

## Skeleton overlay

While a set is live, the detected skeleton is drawn over the camera preview
(`SkeletonOverlay.tsx`, geometry in `skeleton.ts`). It is the user's evidence
that tracking works: a missed rep with a visible skeleton that lost the wrist
explains itself.

- Joints the exercise is measured on (`focusJoints()`) draw in ember; the rest
  in faint white. The whole skeleton dims while framing is not trackable.
- Positions get their own light One Euro smoothing, separate from the rep
  detector's angle filter — the overlay has to keep up with the body.
- `toView()` applies the preview's "cover" crop and mirrors only when the
  preview and the analysed frame disagree (`frame.isMirrored`).
- The body icon in the header hides it; the choice persists.

## Adding an exercise

Add an entry to `PROFILES` in `profiles.ts`. The fields that matter:

- `patterns` — regexes matched against the exercise name
- `primaryAngle` + `topAngle` / `bottomAngle` — degrees at each end of the rep
- `requiredJoints` — keep this **as short as the movement genuinely allows**;
  every joint added here is a framing constraint imposed on the user
- `fallback` — a second angle source, where one honestly describes the same
  movement
- `rules` — which checks from `formRules.ts` apply
- `framingTip` — one plain sentence, shown when framing is the blocker

Anything unmatched falls through to `GENERIC_PROFILE`, which counts reps off
elbow angle and applies only tempo and symmetry checks.
