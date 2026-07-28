# Future You — pre-generated avatar cards

Generation spec for the photo-realistic "Future You" cards: a grid of
pre-generated, faceless body photos spanning body-fat % × muscle level, per
sex, across a small set of avatars. The app picks the nearest cell to a
user's current stats and their projected stats (see `futureSelf.ts`) and
shows a Now → Projected comparison — no per-user AI call, no photo upload,
no consent flow, and no identity-drift risk, because nothing is generated
from a real user's photo.

This replaces the Perfect Corp AI Body Reshape path (real-photo warp) for
the primary "Future You" visual. See `src/lib/futureSelfPhoto.ts` /
`FutureSelfPhotoSheet.tsx` for that alternate, still-available path.

## Why faceless + head-down (not a chin crop)

A photo cropped at the chin reads as a decapitated body — unsettling. A
photo with the head bowed forward, looking down at the torso, keeps the
figure whole: it reads as a candid "sizing myself up" pose, the face is
naturally out of frame, and it avoids both the creepy-crop problem and any
identity/deepfake concern (it isn't anyone's real face). Keep the *posture*
upright and confident (shoulders back) — only the head tilts down, so the
figure doesn't read as slumped or defeated.

## Grid

- **2 sexes** × **5 avatars per sex** × **5 body-fat levels** × **4 muscle
  levels** = 200 cards total, generated once, offline.
- Body-fat levels match the ranges already used in
  `PhysiqueSilhouette.tsx`'s `BOUNDS` (male 8–30%, female 16–38%), split into
  5 even steps:

  | Level | Male bf% | Female bf% |
  |---|---|---|
  | bf0 | 10 | 18 |
  | bf1 | 15 | 23 |
  | bf2 | 20 | 28 |
  | bf3 | 25 | 33 |
  | bf4 | 30 | 38 |

- Muscle levels are 0..1 (as used by `projectBodyFatOutlook`'s
  `muscleLevel`), split into 4 buckets:

  | Level | Muscle (0..1) | Description |
  |---|---|---|
  | m0 | ~0.15 | untrained, minimal muscle |
  | m1 | ~0.40 | average tone (the app's default "current" muscle) |
  | m2 | ~0.65 | fit and clearly toned, athletic |
  | m3 | ~0.90 | very muscular, well-developed |

## Naming / storage convention

Upload to the public Supabase Storage bucket `future-self-cards`, one PNG
per cell:

```
future-self-cards/{male|female}/a{1-5}/bf{0-4}_m{0-3}.png
```

Mirrors the existing `exercise-media/{id}.png` convention in
`src/lib/exerciseMedia.ts` — cards are resolved by URL convention, no
database rows, and missing cells degrade gracefully (see
`futureSelfCards.ts`).

## Generation workflow (Higgsfield or any photoreal image model)

1. Pick a photoreal still model (e.g. Soul; Nano Banana tends to follow
   suppression instructions — "no visible abs", "no muscle definition" —
   more reliably than Soul, which has a strong prior toward lean/toned
   bodies).
2. For each avatar, generate the **anchor** cell first — `bf2_m1` (average
   body fat, average muscle) — and iterate on the prompt until the pose,
   crop, lighting, and background look right.
3. Use that anchor image as a **character/style reference** (and reuse its
   seed if the tool exposes one) for the avatar's other 19 cells, so only
   the body-composition wording changes across the set — everything else
   (pose, framing, lighting, background, outfit) stays identical.
4. **Generate the softest body first if abs won't go away.** Image models
   have a strong prior toward lean/toned bodies for "fitness photo" prompts.
   It's easier to get the model to lean an already-soft anchor *out* toward
   leaner cells than to convince it to add visible fat to an already-lean
   anchor. If a cell keeps rendering abs it shouldn't have, regenerate that
   avatar's `bf4_m0` first and use it as the reference instead.

## Avatar identities (5 per sex)

Vary skin tone and frame so the 5 avatars cover a broad range of users:

- **a1** — light skin, average build
- **a2** — fair skin, slim/ectomorph frame
- **a3** — tan/olive skin, broad/endomorph-leaning frame
- **a4** — dark skin, athletic mesomorph frame
- **a5** — deep skin, tall lean frame

## Prompt template

### Style block (identical across every single card — copy verbatim)

> A plain full-body studio reference photograph of an everyday [man/woman],
> standing front-facing, head tilted down looking at their own torso — face
> not visible, only the top of the head and hair shown, confident upright
> posture with shoulders back, arms relaxed slightly away from the sides.
> Wearing [plain grey boxer briefs, bare torso and legs visible / a plain
> sports bra and briefs, bare torso and legs visible] so body composition is
> fully visible. Soft even studio lighting, plain dark charcoal seamless
> background (#1A1A1A), photorealistic, sharp focus, neutral color grade,
> entire body from head to feet centered in frame, vertical 3:4.

Avoid the words "fitness," "athletic," or "sports" in the framing — they
bias every image model toward a lean, toned body regardless of the
body-composition clause that follows.

### Avatar identity clause (fixed per avatar, appended after the style block)

| Avatar | Clause |
|---|---|
| a1 | Light skin, average build. |
| a2 | Fair skin, slim frame. |
| a3 | Tan/olive skin, broad frame. |
| a4 | Dark skin, athletic mesomorph frame. |
| a5 | Deep skin, tall lean frame. |

### Body-composition clause (the only thing that changes per cell)

State the visible **outcome**, not just the fat/muscle inputs — image
models otherwise default to visible abs whenever a body is shown shirtless.

| Cell | Clause |
|---|---|
| bf0_m0 | Very lean and thin, minimal muscle, flat stomach with faint natural definition, no real muscle tone. |
| bf0_m1 | Lean, low body fat, flat firm stomach with a faint natural ab outline, average muscle — not a bodybuilder. |
| bf0_m2 | Very lean with a clearly visible six-pack and toned athletic muscle. |
| bf0_m3 | Very lean with a well-defined six-pack, very muscular and well-developed physique. |
| bf1_m0 | Trim, flat smooth stomach with no visible abs, minimal muscle, untrained build. |
| bf1_m1 | Trim and healthy, flat smooth stomach with no visible six-pack, ordinary muscle tone. |
| bf1_m2 | Lean and toned, faint ab definition starting to show, athletic build. |
| bf1_m3 | Lean with visible muscle definition and a hint of ab definition, muscular build. |
| bf2_m0 | Average everyday body, slightly soft midsection with a light layer of fat, no visible abs, untoned. |
| bf2_m1 | Average everyday body, slightly soft midsection, no visible abs, ordinary muscle tone — this is the anchor cell. |
| bf2_m2 | Average body fat but noticeably toned arms and shoulders, soft midsection with no visible abs. |
| bf2_m3 | Muscular build (broad shoulders, developed arms) with a layer of fat over the midsection hiding any ab definition — a strongman/powerlifter look. |
| bf3_m0 | Carries extra weight, soft rounded belly, no muscle definition, no abs, sedentary build. |
| bf3_m1 | Carries some extra weight, soft rounded belly, no muscle definition, no abs. |
| bf3_m2 | Overweight but with visibly toned arms and shoulders, soft rounded belly with no abs. |
| bf3_m3 | Heavyset and strong-looking, broad muscular shoulders and arms, soft round belly with no visible abs. |
| bf4_m0 | Noticeably overweight, large soft protruding belly, thick waist, no visible muscle or abs, sedentary build. |
| bf4_m1 | Overweight, large soft belly, thick waist, no muscle definition. |
| bf4_m2 | Overweight with a large soft belly, but visibly toned/muscular arms and shoulders. |
| bf4_m3 | Very heavyset with a large soft belly, but broad, powerfully muscular shoulders and arms — a large strongman build. |

### Negative prompt (use on every cell except bf0_m2/bf0_m3/bf1_m3, which want visible abs)

```
six-pack, abs, ab definition, muscle striations, toned stomach, shredded,
ripped, bodybuilder, chiseled, defined abdominals
```

### Worked example

Male, avatar a4, cell `bf3_m0` (overweight, untrained):

> A plain full-body studio reference photograph of an everyday man, standing
> front-facing, head tilted down looking at his own torso — face not
> visible, only the top of the head and hair shown, confident upright
> posture with shoulders back, arms relaxed slightly away from the sides.
> Wearing plain grey boxer briefs, bare torso and legs visible, so body
> composition is fully visible. Soft even studio lighting, plain dark
> charcoal seamless background (#1A1A1A), photorealistic, sharp focus,
> neutral color grade, entire body from head to feet centered in frame,
> vertical 3:4. Dark skin, athletic mesomorph frame. Carries extra weight,
> soft rounded belly, no muscle definition, no abs, sedentary build.
>
> Negative prompt: six-pack, abs, ab definition, muscle striations, toned
> stomach, shredded, ripped, bodybuilder, chiseled, defined abdominals

## Rollout

Cards are optional per cell — `futureSelfCards.ts` resolves a card URL and
the UI falls back to the existing `PhysiqueSilhouette` illustration for any
cell that doesn't exist yet. Ship avatar `a1` for both sexes first (40
cards), verify quality and representation coverage, then fill in a2–a5.
