import { useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useActiveWorkout } from '@/hooks/useAppQueries';
import { useLiveWorkoutOverlayStore } from '@/features/workouts/stores/liveWorkoutOverlayStore';
import { elapsedSecondsSince, formatElapsed } from '@/features/workouts/utils/liveWorkout';
import { LiveWorkoutSheet } from '@/features/workouts/components/live/LiveWorkoutSheet';
import { WorkoutMiniPlayer } from '@/features/workouts/components/live/WorkoutMiniPlayer';

export function ActiveWorkoutOverlay() {
  const insets = useSafeAreaInsets();
  const activeWorkout = useActiveWorkout();
  const setSessionId = useLiveWorkoutOverlayStore((state) => state.setSessionId);
  const setActiveWorkout = useLiveWorkoutOverlayStore((state) => state.setActiveWorkout);
  const expanded = useLiveWorkoutOverlayStore((state) => state.expanded);
  const open = useLiveWorkoutOverlayStore((state) => state.open);
  const minimize = useLiveWorkoutOverlayStore((state) => state.minimize);
  const timerPaused = useLiveWorkoutOverlayStore((state) => state.timerPaused);
  const pausedElapsedSeconds = useLiveWorkoutOverlayStore((state) => state.pausedElapsedSeconds);
  const toggleTimer = useLiveWorkoutOverlayStore((state) => state.toggleTimer);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

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

  const elapsedSeconds = timerPaused && pausedElapsedSeconds != null ? pausedElapsedSeconds : elapsedSecondsSince(session.startedAt, nowMs);
  const floatingBottom = Math.max(insets.bottom - 4, 12);
  const tabBarHeight = 62;
  const miniBottom = floatingBottom + tabBarHeight + 8;

  return (
    <>
      {expanded ? (
        <LiveWorkoutSheet sessionId={session.id} visible={expanded} bottomInset={insets.bottom} onMinimize={minimize} />
      ) : (
        <WorkoutMiniPlayer
          title={session.title}
          elapsedLabel={formatElapsed(elapsedSeconds)}
          paused={timerPaused}
          onOpen={() => open(session.id)}
          onExpand={() => open(session.id)}
          onTogglePause={() => toggleTimer(elapsedSeconds)}
          bottom={miniBottom}
        />
      )}
    </>
  );
}
