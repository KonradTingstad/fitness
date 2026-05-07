import { Exercise } from '@/domain/models';

export const EXERCISE_MUSCLE_CATEGORIES = [
  'All',
  'Core',
  'Arms',
  'Back',
  'Chest',
  'Legs',
  'Shoulders',
  'Other',
  'Olympic',
  'Full Body',
  'Cardio',
] as const;

export const EXERCISE_TYPE_CATEGORIES = [
  'All',
  'Barbell',
  'Dumbbell',
  'Machine / Other',
  'Weighted Bodyweight',
  'Assisted Bodyweight',
  'Reps Only',
  'Cardio',
  'Duration',
] as const;

export type ExerciseMuscleCategory = (typeof EXERCISE_MUSCLE_CATEGORIES)[number];
export type ExerciseTypeCategory = (typeof EXERCISE_TYPE_CATEGORIES)[number];

export interface ExerciseLibraryFilters {
  query?: string;
  muscleCategory?: ExerciseMuscleCategory;
  typeCategory?: ExerciseTypeCategory;
}

const OLYMPIC_TERMS = ['olympic', 'snatch', 'clean', 'jerk'];
const DURATION_TERMS = ['duration', 'timed', 'hold', 'plank', 'wall sit', 'stretch'];

export function getExerciseMuscleCategory(exercise: Exercise): Exclude<ExerciseMuscleCategory, 'All'> {
  const searchable = searchableParts(exercise);
  if (includesAny(searchable, ['cardio', 'running', 'treadmill', 'cycling', 'rowing'])) return 'Cardio';
  if (includesAny(searchable, OLYMPIC_TERMS)) return 'Olympic';
  if (includesAny(searchable, ['full body', 'total body'])) return 'Full Body';
  if (includesAny(searchable, ['abdominals', 'abs', 'core', 'obliques'])) return 'Core';
  if (includesAny(searchable, ['biceps', 'triceps', 'forearms', 'arms'])) return 'Arms';
  if (includesAny(searchable, ['chest', 'pectorals', 'pecs'])) return 'Chest';
  if (includesAny(searchable, ['quadriceps', 'quads', 'hamstrings', 'glutes', 'calves', 'abductors', 'adductors', 'legs', 'posterior chain'])) {
    return 'Legs';
  }
  if (includesAny(searchable, ['shoulders', 'deltoids', 'delts', 'rear delts'])) return 'Shoulders';
  if (includesAny(searchable, ['lats', 'middle back', 'lower back', 'upper back', 'back', 'traps', 'neck'])) return 'Back';
  return 'Other';
}

export function getExerciseTypeCategory(exercise: Exercise): Exclude<ExerciseTypeCategory, 'All'> {
  const searchable = searchableParts(exercise);
  const equipment = normalizeSearchText([exercise.equipment, ...(exercise.equipmentOptions ?? [])].join(' '));

  if (getExerciseMuscleCategory(exercise) === 'Cardio' || includesAny(searchable, ['cardio', 'treadmill', 'run', 'cycling', 'rowing'])) {
    return 'Cardio';
  }
  if (includesAny(searchable, ['assisted'])) return 'Assisted Bodyweight';
  if (includesAny(searchable, ['weighted']) && includesAny(searchable, ['bodyweight', 'body only', 'pull-up', 'chin-up', 'dip'])) {
    return 'Weighted Bodyweight';
  }
  if (includesAny(searchable, DURATION_TERMS)) return 'Duration';
  if (includesAny(equipment, ['barbell', 'e z curl bar', 'ez curl bar'])) return 'Barbell';
  if (includesAny(equipment, ['dumbbell', 'dumbbells', 'kettlebell', 'kettlebells'])) return 'Dumbbell';
  if (includesAny(equipment, ['bodyweight', 'body only', 'none'])) return 'Reps Only';
  if (includesAny(equipment, ['machine', 'cable', 'bands', 'band', 'exercise ball', 'medicine ball', 'other', 'foam roll'])) {
    return 'Machine / Other';
  }
  return 'Machine / Other';
}

export function filterExerciseLibrary(exercises: Exercise[], filters: ExerciseLibraryFilters): Exercise[] {
  const query = normalizeSearchText(filters.query ?? '');
  const muscle = filters.muscleCategory ?? 'All';
  const type = filters.typeCategory ?? 'All';

  return sortExerciseLibrary(
    exercises.filter((exercise) => {
      const matchesQuery = !query || searchableParts(exercise).includes(query);
      const matchesMuscle = muscle === 'All' || getExerciseMuscleCategory(exercise) === muscle;
      const matchesType = type === 'All' || getExerciseTypeCategory(exercise) === type;
      return matchesQuery && matchesMuscle && matchesType;
    }),
  );
}

export function getExerciseMuscleFilterLabel(category: ExerciseMuscleCategory): string {
  return category === 'All' ? 'Any muscle' : category;
}

export function getExerciseTypeFilterLabel(category: ExerciseTypeCategory): string {
  return category === 'All' ? 'Any type' : category;
}

export function sortExerciseLibrary(exercises: Exercise[]): Exercise[] {
  return [...exercises].sort((a, b) => {
    const favoriteDelta = Number(Boolean(b.isFavorite)) - Number(Boolean(a.isFavorite));
    if (favoriteDelta !== 0) {
      return favoriteDelta;
    }
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

function searchableParts(exercise: Exercise): string {
  return normalizeSearchText(
    [
      exercise.name,
      exercise.primaryMuscle,
      ...(exercise.primaryMuscles ?? []),
      ...(exercise.secondaryMuscles ?? []),
      exercise.equipment,
      ...(exercise.equipmentOptions ?? []),
      exercise.category,
      exercise.force,
      exercise.mechanic,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function normalizeSearchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term));
}
