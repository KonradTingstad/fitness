import { useEffect, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkout } from '@/hooks/useAppQueries';
import { useLiveWorkoutOverlayStore } from '@/features/workouts/stores/liveWorkoutOverlayStore';
import { LiveWorkoutSheet } from '@/features/workouts/components/live/LiveWorkoutSheet';

export function ActiveWorkoutOverlay() {
  const insets = useSafeAreaInsets();
  const activeWorkout = useActiveWorkout();
  const setSessionId = useLiveWorkoutOverlayStore((state) => state.setSessionId);
  const setActiveWorkout = useLiveWorkoutOverlayStore((state) => state.setActiveWorkout);
  const expanded = useLiveWorkoutOverlayStore((state) => state.expanded);
  const open = useLiveWorkoutOverlayStore((state) => state.open);
  const minimize = useLiveWorkoutOverlayStore((state) => state.minimize);

  const session = useMemo(() => activeWorkout.data ?? null, [activeWorkout.data]);

  useEffect(() => {
    if (session?.id) {
      setSessionId(session.id);
      setActiveWorkout({ hasActiveWorkout: true, sessionId: session.id });
      return;
    }
    if (!activeWorkout.isLoading) {
      setActiveWorkout({ hasActiveWorkout: false, sessionId: null });
    }
  }, [activeWorkout.isLoading, session?.id, setActiveWorkout, setSessionId]);

  if (!session) {
    return null;
  }

  const floatingBottom = Math.max(insets.bottom - 4, 12);
  const tabBarHeight = 62;
  const miniBottom = floatingBottom + tabBarHeight;

  return (
    <LiveWorkoutSheet
      sessionId={session.id}
      expanded={expanded}
      bottomInset={insets.bottom}
      miniBottom={miniBottom}
      onExpand={() => open(session.id)}
      onMinimize={minimize}
    />
  );
}
