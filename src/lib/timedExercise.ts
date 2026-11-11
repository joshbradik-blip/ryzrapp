export function isStaticHold(exerciseId: string): boolean {
  return ['plank', 'side_plank', 'wall_sit'].includes(exerciseId);
}

// The prescription is authoritative, including for imported/custom exercises.
export function timedExerciseSeconds(exerciseId: string, prescription: string): number | null {
  const match = prescription.trim().match(/^(\d+(?:\.\d+)?)(?:\s*[-–]\s*\d+(?:\.\d+)?)?\s*(s|sec(?:ond)?s?|m|min(?:ute)?s?)\b/i);
  if (match) return Math.max(1, Math.round(Number(match[1]) * (/^m/i.test(match[2]) ? 60 : 1)));
  return isStaticHold(exerciseId)
    ? Math.max(1, Math.round(Number(prescription.trim().match(/^\d+$/)?.[0] ?? 30)))
    : null;
}

export function elapsedSeconds(startedAt: number, accumulatedMilliseconds: number, now: number): number {
  return Math.floor((accumulatedMilliseconds + Math.max(0, now - startedAt)) / 1000);
}
