import { FREE_EXERCISE_DB_EXERCISES } from '@/data/seed/freeExerciseDb';

function normalizedName(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

describe('free exercise db seed import', () => {
  it('imports an offline strength exercise library with source metadata', () => {
    expect(FREE_EXERCISE_DB_EXERCISES.length).toBeGreaterThan(500);
    expect(FREE_EXERCISE_DB_EXERCISES.every((exercise) => exercise.source === 'free-exercise-db')).toBe(true);
    expect(FREE_EXERCISE_DB_EXERCISES.every((exercise) => exercise.category === 'strength')).toBe(true);
    expect(FREE_EXERCISE_DB_EXERCISES.every((exercise) => exercise.isCustom !== true)).toBe(true);
    expect(FREE_EXERCISE_DB_EXERCISES.every((exercise) => !('instructions' in exercise) && !('level' in exercise))).toBe(true);
  });

  it('deduplicates source ids and normalized names', () => {
    const sourceIds = new Set<string>();
    const names = new Set<string>();

    for (const exercise of FREE_EXERCISE_DB_EXERCISES) {
      const name = normalizedName(exercise.name);
      expect(sourceIds.has(exercise.sourceId)).toBe(false);
      expect(names.has(name)).toBe(false);
      sourceIds.add(exercise.sourceId);
      names.add(name);
    }
  });

  it('keeps useful metadata without requiring exercise images in the UI', () => {
    const sitUp = FREE_EXERCISE_DB_EXERCISES.find((exercise) => exercise.sourceId === '3_4_Sit-Up');

    expect(sitUp).toBeDefined();
    expect(sitUp?.equipment).toBe('Bodyweight');
    expect(sitUp?.primaryMuscles).toContain('abdominals');
    expect(sitUp?.imagePaths.length).toBeGreaterThan(0);
  });
});
