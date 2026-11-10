# Workout timers, feature tips, and founding-member pricing

## Founding membership: $49.99

The app already has `PRICE_LIFETIME = 49.99` in `src/store/subscriptionStore.ts`. This is a fallback only. `StoreScreen` uses the localized price returned by the RevenueCat Lifetime package when available.

Change the actual product price in both stores:

1. **App Store Connect:** Apps → RYZR → Monetization → In-App Purchases → the lifetime non-consumable product → Price Schedule. Set the US price to $49.99 and review regional prices/effective date.
2. **Google Play Console:** RYZR → Monetize with Play → Products → One-time products (or In-app products in the older UI) → the lifetime product → active purchase option/pricing. Set the US price to $49.99 and apply the changes.
3. **RevenueCat:** RYZR project → Product catalog → Offerings → current offering → Lifetime package. Confirm it links the correct Apple and Google lifetime products. RevenueCat imports the store price; changing app display text alone does not change the charge.
4. Reopen Membership after store propagation and confirm both the card and the store purchase confirmation show the expected price. Sandbox/store caching can delay the refresh.

Monthly and annual prices were not changed in this task.

## Timed exercises

`timedExerciseSeconds` recognizes seconds/minutes in prescriptions, including ranges. Plank and other known static holds also default to a timer when their prescription lacks a time suffix. Timed work replaces the weight/reps stage and Log Set with Start/Pause/Resume, Complete Hold, and Reset. Completed efforts remain grouped by the prescribed number of holds or intervals, with rest between efforts. Static holds are labeled as holds; timed movement/cardio uses intervals.

Elapsed time uses wall-clock timestamps, including time in the background, and excludes paused time. The target gives a haptic cue; completion remains explicit so a longer or shorter hold can be saved. Durations persist in `session_sets.duration_seconds`; timed entries use zero reps and weight and do not add lifting volume. Workout completion and subsequent session recall display duration.

Live backend: `timed_exercise_duration` migration applied and `save-workout-session` version 18 deployed with JWT verification enabled. Existing clients continue to work because duration is nullable. The app code still needs a release to reach installed clients.

## Feature tips

`FeatureTip` highlights the actual feature above a dimmed background, presents a raised instruction card, and blocks progress until **Got it** is pressed. Back/outside taps do not dismiss it. Acknowledgments persist on the device. Only one tip appears at a time, and repeated instances of a feature share acknowledgment.

Coverage includes workout entry, library/search, exercise demos/swaps, logging/timers/rest, coach chat/camera/microphone, programs, workout sharing, progress charts, measurements, Future You, nutrition logging/AI/targets/day navigation, store plans/FAQ/restoration, referrals, profile settings, and health connection.

Tips appear when their target is on screen. No automatic scrolling moves the user away from their current task. New features should wrap their target in `FeatureTip` with a stable ID and specific explanatory copy.

## Approved media in Supabase

The user approved and attached these exact files; those selections supersede all earlier generated alternatives:

- Walking lunge: `hf_20261110_191005_3d667b53-2646-4f0e-9492-0c4a6fc45408.mp4` → `exercise-media/lunge.mp4`.
- Plank: `hf_20261110_191624_ef836156-b005-4337-bafb-439981b50796.mp4` → `exercise-media/plank.mp4`.

Both clips are uploaded without editing. Matching PNG thumbnails were extracted at 2.5 seconds and uploaded to `lunge.png` and `plank.png`. The public files were downloaded and SHA-256 checked against the originals. The app’s media references and upload manifest now use Supabase Storage URLs with content versions to refresh caches. Existing installed versions using the standard Storage paths can fetch the new assets without an app release; cached media may require reopening the exercise.

The upload used a temporary, JWT-protected, expiring endpoint restricted by a random token and exact file hashes. After successful upload, it was replaced by a permanent HTTP 410 handler with no storage access. No bucket policies or client credentials were changed.

Approved video SHA-256:

- lunge.mp4: `4a77f3c3163ab34d800f5641be4d8baf8d4d00c01bbf9d293c14921cf691f741`
- plank.mp4: `37aff42b86428596f1de492b7a6c76ee5b7be60a1eaa17acaf1b1c5e62c020af`

## Verification

- App TypeScript: `npx tsc --noEmit -p /workspace/ryzrapp-setup/tsconfig.app.json`
- Workout controls: `npm run test:workout-controls`
- Existing preview regression suite: `npm run test:preview`
- Live schema column and positive-duration constraint verified through SQL.
- Unauthenticated save endpoint verified to return HTTP 401.

Device layout and store purchase confirmation still need checking on a built app before release. Whole-repository TypeScript includes existing stub-app and pose-test errors; the app-only check excludes those files.
