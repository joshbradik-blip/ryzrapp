import { Exercise, ExerciseDBExercise, SubstituteOption } from '../types';
import { EXERCISES } from '../constants/exercises';
import {
  getExercisesByTarget,
  categoryToTargets,
  mapEquipmentToDB,
} from '../lib/exercisedb';

function isEquipmentCompatible(
  exerciseEquipment: string[],
  userEquipment: string[]
): boolean {
  if (exerciseEquipment.length === 0) return true; // bodyweight
  return exerciseEquipment.some((eq) => userEquipment.includes(eq));
}

function isInjurySafe(contraindications: string[], userInjuries: string[]): boolean {
  if (contraindications.length === 0 || userInjuries.length === 0) return true;
  return !contraindications.some((c) => userInjuries.includes(c));
}

function dbEquipmentCompatible(dbEquipment: string, userDBEquipment: string[]): boolean {
  if (dbEquipment === 'body weight') return true;
  return userDBEquipment.includes(dbEquipment);
}

function toSubstituteOption(
  exercise: Exercise,
  userEquipment: string[],
  userInjuries: string[]
): SubstituteOption {
  const equipOk = isEquipmentCompatible(exercise.equipment_required, userEquipment);
  const injuryOk = isInjurySafe(exercise.contraindications, userInjuries);
  return {
    source: 'local',
    localExercise: exercise,
    isEquipmentCompatible: equipOk,
    isInjurySafe: injuryOk,
    id: exercise.id,
    name: exercise.name,
    equipment: exercise.equipment_required.join(', ') || 'bodyweight',
    difficulty: exercise.difficulty,
    muscles: [...exercise.muscles_primary, ...exercise.muscles_secondary.slice(0, 1)].join(' · '),
  };
}

function dbToSubstituteOption(
  ex: ExerciseDBExercise,
  userDBEquipment: string[]
): SubstituteOption {
  const equipOk = dbEquipmentCompatible(ex.equipment, userDBEquipment);
  return {
    source: 'exercisedb',
    dbExercise: ex,
    isEquipmentCompatible: equipOk,
    isInjurySafe: true, // ExerciseDB has no contraindication data; surface with caveat
    id: `edb_${ex.id}`,
    name: ex.name,
    equipment: ex.equipment,
    difficulty: ex.difficulty,
    muscles: [ex.target, ...(ex.secondaryMuscles ?? []).slice(0, 1)].join(' · '),
  };
}

function sortOptions(options: SubstituteOption[]): SubstituteOption[] {
  return [...options].sort((a, b) => {
    const scoreA = (a.isEquipmentCompatible ? 2 : 0) + (a.isInjurySafe ? 1 : 0);
    const scoreB = (b.isEquipmentCompatible ? 2 : 0) + (b.isInjurySafe ? 1 : 0);
    return scoreB - scoreA;
  });
}

export interface SubstituteResults {
  compatible: SubstituteOption[];   // equipment OK + injury safe
  incompatible: SubstituteOption[]; // equipment missing or injury risk
}

export async function findSubstitutes(
  currentExercise: Exercise,
  userEquipment: string[],
  userInjuries: string[]
): Promise<SubstituteResults> {
  const userDBEquipment = mapEquipmentToDB(userEquipment);

  // --- Local substitutes (same category, excluding self) ---
  const localOptions = EXERCISES
    .filter((e) => e.id !== currentExercise.id && e.category === currentExercise.category)
    .map((e) => toSubstituteOption(e, userEquipment, userInjuries));

  // --- ExerciseDB substitutes ---
  const targets = categoryToTargets(currentExercise.category);
  const dbResults = await Promise.all(targets.map((t) => getExercisesByTarget(t)));

  const seen = new Set<string>(localOptions.map((o) => o.name.toLowerCase()));
  seen.add(currentExercise.name.toLowerCase());

  const dbOptions: SubstituteOption[] = [];
  for (const exercises of dbResults) {
    for (const ex of exercises) {
      if (!seen.has(ex.name.toLowerCase())) {
        seen.add(ex.name.toLowerCase());
        dbOptions.push(dbToSubstituteOption(ex, userDBEquipment));
      }
    }
  }

  const all = sortOptions([...localOptions, ...dbOptions]);

  return {
    compatible: all.filter((o) => o.isEquipmentCompatible && o.isInjurySafe),
    incompatible: all.filter((o) => !o.isEquipmentCompatible || !o.isInjurySafe),
  };
}
