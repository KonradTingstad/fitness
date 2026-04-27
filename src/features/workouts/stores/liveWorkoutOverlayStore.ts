import { create } from 'zustand';

interface LiveWorkoutOverlayState {
  sessionId: string | null;
  hasActiveWorkout: boolean;
  expanded: boolean;
  timerPaused: boolean;
  pausedElapsedSeconds: number | null;
  setActiveWorkout: (input: { hasActiveWorkout: boolean; sessionId?: string | null }) => void;
  open: (sessionId?: string | null) => void;
  minimize: () => void;
  setSessionId: (sessionId: string | null) => void;
  toggleTimer: (currentElapsedSeconds: number) => void;
}

export const useLiveWorkoutOverlayStore = create<LiveWorkoutOverlayState>((set) => ({
  sessionId: null,
  hasActiveWorkout: false,
  expanded: false,
  timerPaused: false,
  pausedElapsedSeconds: null,
  setActiveWorkout: ({ hasActiveWorkout, sessionId }) =>
    set((state) => {
      if (!hasActiveWorkout) {
        return {
          hasActiveWorkout: false,
          sessionId: null,
          expanded: false,
          timerPaused: false,
          pausedElapsedSeconds: null,
        };
      }
      return {
        hasActiveWorkout: true,
        sessionId: sessionId ?? state.sessionId,
        ...(sessionId && sessionId !== state.sessionId
          ? {
              timerPaused: false,
              pausedElapsedSeconds: null,
            }
          : {}),
      };
    }),
  open: (sessionId) =>
    set((state) => ({
      expanded: true,
      sessionId: sessionId ?? state.sessionId,
    })),
  minimize: () => set({ expanded: false }),
  setSessionId: (sessionId) => set({ sessionId }),
  toggleTimer: (currentElapsedSeconds) =>
    set((state) => {
      if (state.timerPaused) {
        return { timerPaused: false, pausedElapsedSeconds: null };
      }
      return { timerPaused: true, pausedElapsedSeconds: Math.max(0, Math.floor(currentElapsedSeconds)) };
    }),
}));
