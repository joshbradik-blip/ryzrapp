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
