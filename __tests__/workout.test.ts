import { calculateSetVolume, calculateWorkoutVolume, detectPersonalRecords, estimatedOneRepMax } from '@/domain/calculations/workout';

describe('workout calculations', () => {
  it('calculates eligible set volume only for completed strength sets', () => {
    expect(calculateSetVolume({ weightKg: 100, reps: 5, setType: 'normal', isCompleted: true })).toBe(500);
    expect(calculateSetVolume({ weightKg: 100, reps: 5, setType: 'timed', isCompleted: true })).toBe(0);
    expect(calculateSetVolume({ weightKg: 100, reps: 5, setType: 'normal', isCompleted: false })).toBe(0);
  });

  it('sums workout volume deterministically', () => {
    expect(
      calculateWorkoutVolume([
        { weightKg: 100, reps: 5, setType: 'normal', isCompleted: true },
        { weightKg: 80, reps: 8, setType: 'drop', isCompleted: true },
      ]),
    ).toBe(1140);
  });

  it('estimates one rep max with Epley formula', () => {
    expect(estimatedOneRepMax(100, 5)).toBe(116.7);
    expect(estimatedOneRepMax(120, 1)).toBe(120);
  });

  it('detects PR categories against previous bests', () => {
    expect(
      detectPersonalRecords(
        { weightKg: 102.5, reps: 6, volume: 615, estimatedOneRepMax: 123 },
        { weightKg: 100, reps: 6, volume: 600, estimatedOneRepMax: 120 },
      ),
    ).toEqual(['max_weight', 'max_volume', 'estimated_1rm']);
  });
});
