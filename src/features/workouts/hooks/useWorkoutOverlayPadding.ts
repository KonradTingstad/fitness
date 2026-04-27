import { useLiveWorkoutOverlayStore } from '@/features/workouts/stores/liveWorkoutOverlayStore';

export function useWorkoutOverlayPadding(base = 0): number {
  const hasActiveWorkout = useLiveWorkoutOverlayStore((state) => state.hasActiveWorkout);
  return base + (hasActiveWorkout ? 86 : 0);
}
