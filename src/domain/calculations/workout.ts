import { SetType, WorkoutSet } from '@/domain/models';

const volumeEligibleTypes: Set<SetType> = new Set(['warmup', 'normal', 'drop', 'failure']);

export function calculateSetVolume(set: Pick<WorkoutSet, 'weightKg' | 'reps' | 'setType' | 'isCompleted'>): number {
  if (!set.isCompleted || !volumeEligibleTypes.has(set.setType)) {
    return 0;
  }
  return Math.max(0, set.weightKg ?? 0) * Math.max(0, set.reps ?? 0);
}

export function calculateWorkoutVolume(sets: Pick<WorkoutSet, 'weightKg' | 'reps' | 'setType' | 'isCompleted'>[]): number {
  return sets.reduce((total, set) => total + calculateSetVolume(set), 0);
}

export function estimatedOneRepMax(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) {
    return 0;
  }
  if (reps === 1) {
    return Math.round(weightKg * 10) / 10;
  }
  return Math.round(weightKg * (1 + reps / 30) * 10) / 10;
}

export interface PersonalRecordInput {
  weightKg?: number | null;
  reps?: number | null;
  volume?: number | null;
  estimatedOneRepMax?: number | null;
}

export function detectPersonalRecords(
  current: PersonalRecordInput,
  previousBest: PersonalRecordInput,
): Array<'max_weight' | 'max_reps' | 'max_volume' | 'estimated_1rm'> {
  const records: Array<'max_weight' | 'max_reps' | 'max_volume' | 'estimated_1rm'> = [];
  if ((current.weightKg ?? 0) > (previousBest.weightKg ?? 0)) {
    records.push('max_weight');
  }
  if ((current.reps ?? 0) > (previousBest.reps ?? 0)) {
    records.push('max_reps');
  }
  if ((current.volume ?? 0) > (previousBest.volume ?? 0)) {
    records.push('max_volume');
  }
  if ((current.estimatedOneRepMax ?? 0) > (previousBest.estimatedOneRepMax ?? 0)) {
    records.push('estimated_1rm');
  }
  return records;
}

export function generateWorkoutTitleForTimeOfDay(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 5) return 'Night Workout';
  if (hour < 12) return 'Morning Workout';
  if (hour < 17) return 'Afternoon Workout';
  if (hour < 22) return 'Evening Workout';
  return 'Night Workout';
}
