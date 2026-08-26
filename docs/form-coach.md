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
   ↓ (native frame-processor plugin, ~30fps, on device)
33 pose keypoints  →  normalizeLandmarks()
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

## Status: what is and is not live

**Shipped and working:** the entire pipeline above, its tests, the framing
coach, the rewritten screen, and per-set Claude coaching.

**Not yet live:** `loadPosePlugin()` currently returns `null`, because **no
native pose-detection plugin is installed yet**. Until one is added, the app
runs the legacy snapshot path (kept deliberately, so an OTA update does not
leave existing builds without a Form Coach — it shows a "Basic mode" notice).

### To light up on-device pose

1. Add a VisionCamera frame-processor pose plugin as a dependency. It must
   register under one of the names in `CANDIDATE_PLUGINS` (`poseLandmarks`,
   `poseDetection`, `pose`) — or add its name to that list.
2. `app.json` already sets `enableFrameProcessors: true` for
   `react-native-vision-camera`.
3. Take a **new native build** — this cannot ship via EAS Update / OTA.
4. Confirm the plugin's output shape is handled by `normalizeLandmarks()`. It
   already understands keyed objects, 33-point BlazePose arrays, and 17-point
   MoveNet arrays; anything else needs a branch there.
5. If the plugin can cheaply supply mean scene luminance, pass it as
   `brightness` on the `PoseFrame` — that is what separates "too dark" from
   "you're out of frame" in the framing coach.

Once the plugin is present, `poseAvailable` flips to true on its own and the
screen switches to the live path with no further changes.

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
