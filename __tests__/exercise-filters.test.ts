import { filterExerciseLibrary, getExerciseMuscleCategory, getExerciseTypeCategory } from '@/domain/calculations/exercises';
import { Exercise } from '@/domain/models';

function exercise(input: Partial<Exercise>): Exercise {
  return {
    id: input.id ?? input.name ?? 'exercise',
    name: input.name ?? 'Exercise',
    primaryMuscle: input.primaryMuscle ?? 'Other',
    primaryMuscles: input.primaryMuscles,
    secondaryMuscles: input.secondaryMuscles,
    equipment: input.equipment ?? 'Other',
    equipmentOptions: input.equipmentOptions,
    category: input.category,
    force: input.force,
    mechanic: input.mechanic,
    isFavorite: input.isFavorite,
    isCustom: false,
  };
}

describe('exercise filter mapping', () => {
  it('maps raw muscle values into app-level muscle categories', () => {
    expect(getExerciseMuscleCategory(exercise({ name: 'Crunch', primaryMuscle: 'Abdominals' }))).toBe('Core');
    expect(getExerciseMuscleCategory(exercise({ name: 'Hammer Curl', primaryMuscle: 'Biceps' }))).toBe('Arms');
    expect(getExerciseMuscleCategory(exercise({ name: 'Lat Pulldown', primaryMuscle: 'Lats' }))).toBe('Back');
    expect(getExerciseMuscleCategory(exercise({ name: 'Leg Press', primaryMuscle: 'Quadriceps' }))).toBe('Legs');
    expect(getExerciseMuscleCategory(exercise({ name: 'Rear Delt Fly', primaryMuscle: 'Rear Delts' }))).toBe('Shoulders');
  });

  it('maps raw equipment into app-level type categories', () => {
    expect(getExerciseTypeCategory(exercise({ name: 'Curl', equipment: 'E-Z Curl Bar' }))).toBe('Barbell');
    expect(getExerciseTypeCategory(exercise({ name: 'Swing', equipment: 'Kettlebells' }))).toBe('Dumbbell');
    expect(getExerciseTypeCategory(exercise({ name: 'Push-Up', equipment: 'Bodyweight' }))).toBe('Reps Only');
    expect(getExerciseTypeCategory(exercise({ name: 'Weighted Pull-Up', equipment: 'Bodyweight' }))).toBe('Weighted Bodyweight');
    expect(getExerciseTypeCategory(exercise({ name: 'Assisted Dip', equipment: 'Machine' }))).toBe('Assisted Bodyweight');
  });

  it('filters locally by query, muscle category, and type category', () => {
    const rows = [
      exercise({ id: 'bench', name: 'Bench Press', primaryMuscle: 'Chest', equipment: 'Barbell' }),
      exercise({ id: 'curl', name: 'Dumbbell Curl', primaryMuscle: 'Biceps', equipment: 'Dumbbell' }),
      exercise({ id: 'run', name: 'Treadmill Run', primaryMuscle: 'Cardio', equipment: 'Machine', category: 'cardio' }),
    ];

    expect(filterExerciseLibrary(rows, { query: 'press', muscleCategory: 'Chest', typeCategory: 'Barbell' }).map((item) => item.id)).toEqual([
      'bench',
    ]);
    expect(filterExerciseLibrary(rows, { muscleCategory: 'Arms' }).map((item) => item.id)).toEqual(['curl']);
    expect(filterExerciseLibrary(rows, { typeCategory: 'Cardio' }).map((item) => item.id)).toEqual(['run']);
  });

  it('sorts favorites to the top within the filtered set', () => {
    const rows = [
      exercise({ id: 'bench', name: 'Bench Press', primaryMuscle: 'Chest', equipment: 'Barbell', isFavorite: false }),
      exercise({ id: 'fly', name: 'Cable Fly', primaryMuscle: 'Chest', equipment: 'Cable', isFavorite: true }),
      exercise({ id: 'incline', name: 'Incline Press', primaryMuscle: 'Chest', equipment: 'Dumbbell', isFavorite: false }),
    ];

    expect(filterExerciseLibrary(rows, { muscleCategory: 'Chest' }).map((item) => item.id)).toEqual(['fly', 'bench', 'incline']);
  });
});
