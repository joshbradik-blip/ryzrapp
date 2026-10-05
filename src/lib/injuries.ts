// Shared injury-matching helper. Injury records distinguish left/right
// shoulder (see onboarding's Injuries screen), but exercise contraindications
// use the generic "shoulders" tag — normalize both to the same tag set so a
// shoulder injury actually filters shoulder exercises regardless of side.
function injuryTags(bodyPart: string): string[] {
  return bodyPart === 'left_shoulder' || bodyPart === 'right_shoulder'
    ? [bodyPart, 'shoulders']
    : [bodyPart];
}

export function conflictsWithInjuries(contraindications: string[], injuryBodyParts: string[]): boolean {
  if (contraindications.length === 0 || injuryBodyParts.length === 0) return false;
  const tags = new Set(injuryBodyParts.flatMap(injuryTags));
  return contraindications.some((c) => tags.has(c));
}

// Maps what someone types on the onboarding Injuries screen to the vocabulary the
// chips use (and that exercise contraindications are keyed on), so a typed
// "left knee" still filters knee exercises. Anything unrecognised is kept as a
// snake_case tag: it still reaches the plan prompt, it just isn't filtered by
// the deterministic exercise rules.
export function normalizeBodyParts(input: string): string[] {
  const t = input.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 40);
  if (!t) return [];
  const side = /\bleft\b/.test(t) ? 'left' : /\bright\b/.test(t) ? 'right' : null;
  if (/shoulder|rotator|delt/.test(t)) return side ? [`${side}_shoulder`] : ['left_shoulder', 'right_shoulder'];
  if (/knee/.test(t)) return ['knees'];
  if (!/upper\s*back/.test(t) && /\bback\b|lumbar|spine|sciatic/.test(t)) return ['lower_back'];
  if (/wrist/.test(t)) return ['wrists'];
  if (/elbow/.test(t)) return ['elbows'];
  if (/neck/.test(t)) return ['neck'];
  if (/\bhips?\b/.test(t)) return ['hips'];
  if (/ankle/.test(t)) return ['ankles'];
  const tag = t.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return tag ? [tag] : [];
}

export function humanizeBodyPart(part: string): string {
  return part.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}
