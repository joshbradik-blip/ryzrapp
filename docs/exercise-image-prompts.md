# RYZR Exercise Demo Image Prompts

These prompts generate the stylized hero images shown on the Exercise Detail screen.

## Workflow

1. Generate each image with your image tool (Higgsfield Soul, OpenAI gpt-image-1, etc.) using the prompt below.
2. Export as **PNG**, square (1:1).
3. Rename the file to the exercise's id, e.g. `squat.png`, `goblet_squat.png` (the filename is listed with each prompt).
4. Upload to the Supabase Storage bucket **`exercise-media`** (dashboard → Storage → exercise-media → Upload). Public read is already enabled.

The app resolves images by convention at `exercise-media/{id}.png`. Until an image exists, the screen shows a branded fallback (exercise initial + muscle chips) — so you can upload them in any order, any time, with no app release.

## Demo clips (motion)

The hero also plays a short looping video when one exists, resolved at `exercise-media/{id}.mp4` (preferred over the still). Workflow:

1. Generate the still (prompt below).
2. Animate it into a **short looping clip** (2–4s) with an image-to-video tool — Higgsfield (Soul/image-to-video) or Google **Veo** (via the Gemini API / AI Studio). Prompt the motion to match the exercise (e.g. "smooth looping squat, descend and stand").
3. Export **H.264 MP4**, small resolution (e.g. 720×720), short — keep file size low for streaming.
4. Name it `{id}.mp4` and upload to the same `exercise-media` bucket.

The app resolves **clip → still → branded fallback**, so clips are entirely optional and can be added later, per exercise, with no app release.

## Shared style block

Prepend or include this in every prompt so all 29 images look like one set:

> **STYLE:** Stylized dark 3D render of a single muscular athletic figure, matte charcoal-black body with subtle ember-orange rim lighting from the right, pure black background, dramatic studio lighting, photoreal materials, centered composition, square 1:1 crop, no text, no watermark, no logos.

---

## Prompts

### Back Squat → `squat.png`
STYLE, performing a barbell back squat at the bottom position: bar racked across upper traps, thighs at parallel, chest tall, knees tracking over toes.

### Goblet Squat → `goblet_squat.png`
STYLE, performing a goblet squat: holding a single dumbbell vertically at chest height, deep squat with elbows inside the knees, torso upright.

### Conventional Deadlift → `deadlift.png`
STYLE, at the lockout of a conventional barbell deadlift: standing tall, shoulders back, barbell at hip height, neutral spine.

### Romanian Deadlift → `rdl.png`
STYLE, mid Romanian deadlift: slight knee bend, hips pushed back, barbell sliding down the thighs to mid-shin, flat back, hamstrings loaded.

### Barbell Bench Press → `bench_press.png`
STYLE, lying on a flat bench pressing a barbell: arms near full extension above the chest, feet planted, slight arch.

### Push-Up → `push_up.png`
STYLE, in the bottom of a push-up: rigid plank line head to heels, elbows at ~45 degrees, chest just above the floor.

### Overhead Press → `overhead_press.png`
STYLE, standing overhead press at lockout: barbell pressed directly overhead, biceps by the ears, braced core, glutes tight.

### Pull-Up → `pull_up.png`
STYLE, at the top of a pull-up: chin over a fixed bar, lats engaged, body hanging tall from an overhand grip.

### Barbell Bent-Over Row → `bent_over_row.png`
STYLE, mid barbell bent-over row: hinged torso near 45 degrees, flat back, barbell pulled to the lower ribs, elbows driving back.

### Single-Arm Dumbbell Row → `dumbbell_row.png`
STYLE, single-arm dumbbell row: one knee and hand on a bench, opposite arm rowing a dumbbell to the hip, flat back.

### Walking Lunge → `lunge.png`
STYLE, mid walking lunge: long stride, front thigh parallel to the floor, back knee hovering just above the ground, upright torso.

### Hip Thrust → `hip_thrust.png`
STYLE, at the top of a barbell hip thrust: upper back on a bench, barbell across the hips, full hip extension, ribs down.

### Glute Bridge → `glute_bridge.png`
STYLE, at the top of a floor glute bridge: shoulders on the ground, hips driven up to a straight line knees-to-shoulders.

### Plank → `plank.png`
STYLE, holding a forearm plank: forearms and toes on the ground, perfectly straight body line, braced core.

### Dead Bug → `deadbug.png`
STYLE, performing a dead bug: lying on back, one arm overhead and opposite leg extended, low back pressed to the floor.

### Pallof Press → `pallof_press.png`
STYLE, performing a Pallof press: standing side-on to a cable, arms pressing a handle straight out from the chest, braced anti-rotation core.

### Face Pull → `face_pull.png`
STYLE, mid face pull: pulling a rope attachment toward the face at eye level, elbows high and wide, rear delts engaged.

### Bulgarian Split Squat → `bulgarian_split_squat.png`
STYLE, bottom of a Bulgarian split squat: rear foot elevated on a bench, front thigh parallel to the floor, upright torso.

### Lat Pulldown → `lat_pulldown.png`
STYLE, mid lat pulldown: seated, pulling a wide bar down to the upper chest, elbows driving down, slight backward lean.

### Tricep Dip → `tricep_dip.png`
STYLE, bottom of a tricep dip on parallel bars: elbows bent to ~90 degrees, torso upright, shoulders above the hands.

### Dumbbell Bicep Curl → `bicep_curl.png`
STYLE, top of a standing dumbbell bicep curl: dumbbells curled to shoulder height, elbows pinned to the sides, controlled squeeze.

### Lateral Raise → `lateral_raise.png`
STYLE, top of a dumbbell lateral raise: arms raised out to the sides to shoulder height, slight elbow bend, side delts engaged.

### Calf Raise → `calf_raise.png`
STYLE, top of a standing calf raise: up on the balls of the feet, heels lifted high, tall posture.

### Mountain Climber → `mountain_climber.png`
STYLE, mid mountain climber: high plank position, one knee driven toward the chest, the other leg extended, athletic tension.

### Jumping Jack → `jumping_jack.png`
STYLE, mid jumping jack: airborne with arms overhead and legs spread wide, dynamic energetic pose.

### Box Jump → `box_jump.png`
STYLE, landing on top of a plyo box: athletic two-foot landing in a quarter squat, arms swinging down, explosive posture.

### Rowing Machine → `row_machine.png`
STYLE, mid stroke on an indoor rowing machine: legs driving, torso leaning back slightly, handle pulled to the lower ribs.

### Band Pull-Apart → `band_pull_apart.png`
STYLE, mid band pull-apart: arms extended at shoulder height, pulling a resistance band apart across the chest, rear delts engaged.

### Kettlebell Swing → `kb_swing.png`
STYLE, top of a kettlebell swing: kettlebell floating at chest height, hips fully extended, arms straight, athletic standing posture.

## Added after the first batch

These six were added to the library after the original generation run, so they
shipped with no media at all — the app fell back to the branded placeholder.
Same STYLE block, same filename convention.

### Burpee → `burpee.png`
STYLE, mid burpee: driving up out of the floor into a vertical jump, arms reaching overhead, chest tall, explosive full-body extension.

### High Knees → `high_knees.png`
STYLE, mid high knees: running in place with one knee driven above hip height, opposite arm forward, tall posture, up on the ball of the standing foot.

### World's Greatest Stretch → `worlds_greatest_stretch.png`
STYLE, mid World's Greatest Stretch: deep lunge with the front knee at 90 degrees and the back leg straight, one hand planted on the floor inside the front foot, the other arm reaching straight toward the ceiling, torso rotated open, eyes following the reaching hand.

### 90/90 Hip Stretch → `ninety_ninety_hip_stretch.png`
STYLE, in the 90/90 hip stretch: seated on the floor, front shin and back shin each bent to 90 degrees, spine tall, hinging forward over the front shin.

### Open-Book Thoracic Rotation → `thoracic_rotation.png`
STYLE, mid open-book thoracic rotation: lying on one side with knees stacked and bent to 90 degrees, the top arm opened across the body toward the floor behind, chest rotated open, lower body still.

### Shoulder Dislocates → `shoulder_dislocates.png`
STYLE, mid shoulder dislocate: standing tall, arms locked straight in a wide grip on a resistance band, the band travelling overhead in a smooth arc behind the head.
