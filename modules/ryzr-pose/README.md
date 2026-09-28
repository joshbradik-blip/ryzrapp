# ryzr-pose

On-device body tracking for the Form Coach, exposed as a VisionCamera 4 frame
processor plugin named `ryzrPose`.

| Platform | Detector | Keypoints |
|---|---|---|
| iOS | Apple Vision `VNDetectHumanBodyPoseRequest` (system framework, adds no app size) | 17 body joints |
| Android | Google ML Kit Pose Detection, stream mode (bundled model) | 17 body joints + heels and feet |

Call from a frame processor worklet:

```ts
const result = plugin.call(frame, { rotation: 90 }); // clockwise degrees to upright
// → { width, height, landmarks: { left_knee: { x, y, score }, ... } }
```

`width`/`height` are the upright image size and `x`/`y` are pixels in that
upright image. `src/lib/pose/nativePose.ts` normalizes them into the pipeline's
coordinate space. Returns `null` when the frame can't be processed.

Native code only — changes here need a new native build (`eas build`), not an
OTA update. If the plugin is missing from a binary, the Form Coach falls back
to the MoveNet tracker. See `docs/form-coach.md`.
