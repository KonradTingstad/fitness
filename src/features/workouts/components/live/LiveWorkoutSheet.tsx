import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronDown, Dumbbell, Plus, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, PanResponder, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import {
  addExerciseToWorkout,
  addSet,
  applyWorkoutSessionToRoutine,
  completeWorkoutSet,
  discardWorkout,
  finishWorkout,
  removeExerciseFromWorkout,
  updateWorkoutSet,
} from '@/data/repositories/workoutRepository';
import { SetType, WorkoutSet } from '@/domain/models';
import { useExercises, useRecentWorkouts, useWorkoutSession } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';
import { ExercisePickerSheet } from '@/features/workouts/components/live/ExercisePickerSheet';
import { SetLoggingTable, WorkoutSetDraft } from '@/features/workouts/components/live/SetLoggingTable';
import { SetTypeMenu } from '@/features/workouts/components/live/SetTypeMenu';
import { WorkoutKeyboard } from '@/features/workouts/components/live/WorkoutKeyboard';
import { useLiveWorkoutOverlayStore } from '@/features/workouts/stores/liveWorkoutOverlayStore';
import { elapsedSecondsSince, formatElapsed } from '@/features/workouts/utils/liveWorkout';

interface Props {
  sessionId: string;
  visible: boolean;
  bottomInset: number;
  onMinimize: () => void;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EditableField = 'weightKg' | 'reps';

export function LiveWorkoutSheet({ sessionId, visible, bottomInset, onMinimize }: Props) {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const session = useWorkoutSession(sessionId);
  const exercises = useExercises();
  const recent = useRecentWorkouts();
  const [nowMs, setNowMs] = useState(Date.now());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedExerciseIds, setSelectedExerciseIds] = useState<Set<string>>(new Set());
  const [setTypeSetId, setSetTypeSetId] = useState<string | null>(null);
  const [activeInput, setActiveInput] = useState<{ setId: string; field: EditableField } | null>(null);
  const [draftBySetId, setDraftBySetId] = useState<Record<string, WorkoutSetDraft>>({});
  const translateY = useRef(new Animated.Value(0)).current;
  const commitActiveDraftRef = useRef<() => void>(() => undefined);
  const timerPaused = useLiveWorkoutOverlayStore((state) => state.timerPaused);
  const pausedElapsedSeconds = useLiveWorkoutOverlayStore((state) => state.pausedElapsedSeconds);
  const toggleTimer = useLiveWorkoutOverlayStore((state) => state.toggleTimer);
  const setActiveWorkout = useLiveWorkoutOverlayStore((state) => state.setActiveWorkout);
  const setSessionId = useLiveWorkoutOverlayStore((state) => state.setSessionId);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!visible) {
      return;
    }
    translateY.setValue(0);
  }, [translateY, visible]);

  useEffect(() => {
    if (!session.data) {
      return;
    }
    setDraftBySetId((current) => {
      const next: Record<string, WorkoutSetDraft> = {};
      for (const exercise of session.data.exercises) {
        for (const set of exercise.sets) {
          const existing = current[set.id];
          next[set.id] = {
            weightKg: existing?.weightKg ?? (set.weightKg != null ? formatNumeric(set.weightKg) : ''),
            reps: existing?.reps ?? (set.reps != null ? formatNumeric(set.reps) : ''),
            rpe: existing?.rpe ?? (set.rpe != null ? formatNumeric(set.rpe) : ''),
          };
        }
      }
      return next;
    });
  }, [session.data]);

  const invalidateWorkout = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workout(sessionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
    queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const updateSetMutation = useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: Partial<WorkoutSet> }) => updateWorkoutSet(setId, patch),
    onSuccess: invalidateWorkout,
  });

  const completeSetMutation = useMutation({
    mutationFn: (setId: string) => completeWorkoutSet(setId),
    onSuccess: invalidateWorkout,
  });

  const addSetMutation = useMutation({
    mutationFn: (workoutExerciseId: string) => addSet(workoutExerciseId),
    onSuccess: invalidateWorkout,
  });

  const addExerciseMutation = useMutation({
    mutationFn: (exerciseId: string) => addExerciseToWorkout(sessionId, exerciseId),
    onSuccess: invalidateWorkout,
  });

  const removeExerciseMutation = useMutation({
    mutationFn: (workoutExerciseId: string) => removeExerciseFromWorkout(workoutExerciseId),
    onSuccess: invalidateWorkout,
    onError: (error) => {
      Alert.alert('Remove exercise', error instanceof Error ? error.message : 'Unable to remove exercise.');
    },
  });

  const finalizeFinishedWorkout = () => {
    queryClient.setQueryData(queryKeys.activeWorkout, null);
    queryClient.invalidateQueries({ queryKey: queryKeys.recentWorkouts });
    queryClient.invalidateQueries({ queryKey: queryKeys.progress });
    queryClient.invalidateQueries({ queryKey: queryKeys.workout(sessionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
    setActiveWorkout({ hasActiveWorkout: false, sessionId: null });
    setSessionId(null);
    onMinimize();
    navigation.navigate('WorkoutSummary', { sessionId });
  };

  const finishMutation = useMutation({
    mutationFn: () => finishWorkout(sessionId),
    onSuccess: finalizeFinishedWorkout,
  });

  const finishAndUpdateRoutineMutation = useMutation({
    mutationFn: async (): Promise<{ routineUpdated: boolean; errorMessage?: string }> => {
      await finishWorkout(sessionId);
      try {
        await applyWorkoutSessionToRoutine(sessionId);
        return { routineUpdated: true };
      } catch (error) {
        return {
          routineUpdated: false,
          errorMessage: error instanceof Error ? error.message : 'Routine template update failed.',
        };
      }
    },
    onSuccess: (result) => {
      if (result.routineUpdated) {
        queryClient.invalidateQueries({ queryKey: queryKeys.routines });
        queryClient.invalidateQueries({ queryKey: ['workoutPlans'] });
      } else {
        Alert.alert('Template not updated', result.errorMessage ?? 'Workout was saved, but template update failed.');
      }
      finalizeFinishedWorkout();
    },
  });

  const discardMutation = useMutation({
    mutationFn: () => discardWorkout(sessionId),
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.activeWorkout, null);
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
      setActiveWorkout({ hasActiveWorkout: false, sessionId: null });
      setSessionId(null);
      onMinimize();
    },
  });

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 8,
        onPanResponderMove: (_, gesture) => {
          if (gesture.dy > 0) {
            translateY.setValue(gesture.dy);
          }
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 130 || gesture.vy > 0.85) {
            Animated.timing(translateY, { toValue: 420, duration: 180, useNativeDriver: true }).start(() => {
              translateY.setValue(0);
              commitActiveDraftRef.current();
              setActiveInput(null);
              setPickerOpen(false);
              setSelectedExerciseIds(new Set());
              setSetTypeSetId(null);
              onMinimize();
            });
            return;
          }
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
        },
      }),
    [onMinimize, translateY],
  );

  const elapsedSeconds = useMemo(() => {
    if (!session.data) {
      return 0;
    }
    if (timerPaused && pausedElapsedSeconds != null) {
      return pausedElapsedSeconds;
    }
    return elapsedSecondsSince(session.data.startedAt, nowMs);
  }, [nowMs, pausedElapsedSeconds, session.data, timerPaused]);

  const headerMeta = useMemo(() => {
    if (!session.data) {
      return 'Loading workout · 0:00';
    }
    const date = new Date(session.data.startedAt).toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    return `${date} · ${formatElapsed(elapsedSeconds)}`;
  }, [elapsedSeconds, session.data]);

  const completedSets = useMemo(
    () =>
      session.data?.exercises
        .flatMap((exercise) => exercise.sets)
        .filter((set) => set.isCompleted).length ?? 0,
    [session.data],
  );

  const totalSets = useMemo(() => session.data?.exercises.flatMap((exercise) => exercise.sets).length ?? 0, [session.data]);

  const fieldOrder = useMemo(() => {
    if (!session.data) {
      return [] as Array<{ setId: string; field: EditableField }>;
    }
    return session.data.exercises.flatMap((exercise) =>
      exercise.sets.flatMap((set) => [
        { setId: set.id, field: 'weightKg' as const },
        { setId: set.id, field: 'reps' as const },
      ]),
    );
  }, [session.data]);

  const previousPerformanceByExerciseId = useMemo<Record<string, string | undefined>>(() => {
    const map: Record<string, string | undefined> = {};
    const recentWorkouts = recent.data ?? [];
    for (const workout of recentWorkouts) {
      for (const exercise of workout.exercises) {
        if (map[exercise.exerciseId]) {
          continue;
        }
        const completed = exercise.sets.find((set) => set.isCompleted);
        if (!completed) {
          continue;
        }
        const weight = completed.weightKg != null ? `${formatNumeric(completed.weightKg)} kg` : null;
        const reps = completed.reps != null ? `${formatNumeric(completed.reps)}` : null;
        map[exercise.exerciseId] = weight && reps ? `${weight} × ${reps}` : reps ? `${reps} reps` : weight ? weight : undefined;
      }
    }
    return map;
  }, [recent.data]);

  const commitDraftForSet = (setId: string) => {
    const draft = draftBySetId[setId];
    if (!draft) {
      return;
    }
    const patch: Partial<WorkoutSet> = {
      weightKg: toOptionalNumber(draft.weightKg),
      reps: toOptionalInteger(draft.reps),
      rpe: toOptionalNumber(draft.rpe),
    };
    updateSetMutation.mutate({ setId, patch });
  };

  const commitActiveDraft = () => {
    if (!activeInput) {
      return;
    }
    commitDraftForSet(activeInput.setId);
  };
  commitActiveDraftRef.current = commitActiveDraft;

  const updateDraftField = (setId: string, field: EditableField | 'rpe', updater: (value: string) => string) => {
    setDraftBySetId((current) => {
      const existing = current[setId] ?? { weightKg: '', reps: '', rpe: '' };
      return {
        ...current,
        [setId]: {
          ...existing,
          [field]: sanitizeValue(updater(existing[field])),
        },
      };
    });
  };

  const handleDigit = (digit: string) => {
    if (!activeInput) {
      return;
    }
    updateDraftField(activeInput.setId, activeInput.field, (value) => `${value}${digit}`);
  };

  const handleDecimal = () => {
    if (!activeInput || activeInput.field !== 'weightKg') {
      return;
    }
    updateDraftField(activeInput.setId, 'weightKg', (value) => (value.includes('.') ? value : `${value}.`));
  };

  const handleBackspace = () => {
    if (!activeInput) {
      return;
    }
    updateDraftField(activeInput.setId, activeInput.field, (value) => value.slice(0, -1));
  };

  const handleStep = (delta: number) => {
    if (!activeInput) {
      return;
    }
    updateDraftField(activeInput.setId, activeInput.field, (value) => {
      const parsed = Number.parseFloat(value.replace(',', '.'));
      const next = Number.isFinite(parsed) ? parsed + delta : delta;
      if (activeInput.field === 'reps') {
        return String(Math.max(0, Math.round(next)));
      }
      return formatNumeric(Math.max(-999, Math.min(999, Math.round(next * 10) / 10)));
    });
  };

  const handleNext = () => {
    if (!activeInput) {
      return;
    }
    const currentIndex = fieldOrder.findIndex((item) => item.setId === activeInput.setId && item.field === activeInput.field);
    commitDraftForSet(activeInput.setId);
    if (currentIndex < 0 || currentIndex === fieldOrder.length - 1) {
      setActiveInput(null);
      return;
    }
    setActiveInput(fieldOrder[currentIndex + 1]);
  };

  const handleRpeShortcut = () => {
    if (!activeInput) {
      return;
    }
    const nextRpe = draftBySetId[activeInput.setId]?.rpe ? Number.parseFloat(draftBySetId[activeInput.setId].rpe) || 8 : 8;
    const value = String(Math.max(6, Math.min(10, nextRpe)));
    setDraftBySetId((current) => ({
      ...current,
      [activeInput.setId]: {
        ...(current[activeInput.setId] ?? { weightKg: '', reps: '', rpe: '' }),
        rpe: value,
      },
    }));
    updateSetMutation.mutate({ setId: activeInput.setId, patch: { rpe: Number(value) } });
  };

  const handleSelectInput = (setId: string, field: EditableField) => {
    if (activeInput && activeInput.setId !== setId) {
      commitDraftForSet(activeInput.setId);
    }
    setActiveInput({ setId, field });
  };

  const handleToggleSetComplete = (setId: string) => {
    commitDraftForSet(setId);
    completeSetMutation.mutate(setId);
  };

  const handleAddExercises = async () => {
    const ids = Array.from(selectedExerciseIds);
    if (!ids.length) {
      return;
    }
    try {
      for (const exerciseId of ids) {
        await addExerciseMutation.mutateAsync(exerciseId);
      }
    } catch (error) {
      Alert.alert('Add exercises', error instanceof Error ? error.message : 'Unable to add selected exercises.');
      return;
    }
    setPickerOpen(false);
    setSelectedExerciseIds(new Set());
  };

  const handleFinish = () => {
    if (finishMutation.isPending || finishAndUpdateRoutineMutation.isPending) {
      return;
    }
    const prompt =
      totalSets === 0
        ? 'No exercises have been added yet. Finish anyway?'
        : completedSets === 0
          ? 'No sets are marked complete. Finish anyway?'
          : `Save workout with ${completedSets} completed sets?`;

    const isRoutineWorkout = Boolean(session.data?.routineId);
    Alert.alert('Finish workout?', prompt, [
      { text: 'Cancel', style: 'cancel' },
      ...(isRoutineWorkout
        ? [
            {
              text: 'Keep template',
              onPress: () => {
                commitActiveDraft();
                finishMutation.mutate();
              },
            },
            {
              text: 'Update template',
              onPress: () => {
                commitActiveDraft();
                finishAndUpdateRoutineMutation.mutate();
              },
            },
          ]
        : [
            {
              text: 'Finish',
              onPress: () => {
                commitActiveDraft();
                finishMutation.mutate();
              },
            },
          ]),
    ]);
  };

  const handleCancelWorkout = () => {
    Alert.alert('Cancel workout?', 'This active workout will be discarded and not saved.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel workout',
        style: 'destructive',
        onPress: () => discardMutation.mutate(),
      },
    ]);
  };

  const handleOpenExerciseMenu = (workoutExerciseId: string) => {
    if (removeExerciseMutation.isPending) {
      return;
    }
    Alert.alert('Remove exercise?', 'This removes the exercise and all logged sets from the current workout.', [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          setActiveInput(null);
          removeExerciseMutation.mutate(workoutExerciseId);
        },
      },
    ]);
  };

  const handleSetTypeChange = (type: SetType) => {
    if (!setTypeSetId) {
      return;
    }
    updateSetMutation.mutate({ setId: setTypeSetId, patch: { setType: type } });
  };

  if (!visible || !session.data) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={() => {
          commitActiveDraft();
          setActiveInput(null);
          setPickerOpen(false);
          setSelectedExerciseIds(new Set());
          setSetTypeSetId(null);
          onMinimize();
        }}
      />

      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.sheet,
          {
            borderColor: theme.colors.border,
            backgroundColor: 'rgba(14,19,25,0.98)',
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.handleWrap}>
          <View style={[styles.handle, { backgroundColor: theme.colors.border }]} />
        </View>

        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              commitActiveDraft();
              setActiveInput(null);
              setPickerOpen(false);
              setSelectedExerciseIds(new Set());
              setSetTypeSetId(null);
              onMinimize();
            }}
            style={({ pressed }) => [styles.headerIcon, { borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 }]}
          >
            <ChevronDown size={17} color={theme.colors.text} />
          </Pressable>

          <View style={styles.headerCopy}>
            <AppText variant="section" weight="800">
              {session.data.title}
            </AppText>
            <AppText muted variant="small">
              {headerMeta}
            </AppText>
          </View>

          <Button
            label="Finish"
            icon={Check}
            onPress={handleFinish}
            disabled={finishMutation.isPending || finishAndUpdateRoutineMutation.isPending}
            style={styles.finishButton}
          />
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: activeInput ? 210 : bottomInset + 22, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.workoutControls}>
            <Pressable
              onPress={() => toggleTimer(elapsedSeconds)}
              style={({ pressed }) => [
                styles.pauseChip,
                { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt, opacity: pressed ? 0.84 : 1 },
              ]}
            >
              <AppText weight="700">{timerPaused ? 'Resume timer' : 'Pause timer'}</AppText>
            </Pressable>
          </View>

          {session.data.exercises.length === 0 ? (
            <View style={[styles.emptyCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
              <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(53,199,122,0.16)' }]}>
                <Dumbbell size={24} color={theme.colors.primary} />
              </View>
              <AppText variant="section">No exercises yet</AppText>
              <AppText muted style={styles.emptySubtitle}>
                Add exercises to start logging your workout.
              </AppText>
            </View>
          ) : (
            <SetLoggingTable
              exercises={session.data.exercises}
              draftBySetId={draftBySetId}
              activeInput={activeInput}
              onSelectInput={handleSelectInput}
              onOpenSetTypeMenu={setSetTypeSetId}
              onToggleSetComplete={handleToggleSetComplete}
              onAddSet={(workoutExerciseId) => addSetMutation.mutate(workoutExerciseId)}
              onOpenHistory={(exerciseId) => navigation.navigate('ExerciseHistory', { exerciseId })}
              onOpenExerciseMenu={handleOpenExerciseMenu}
            />
          )}

          <View style={styles.actionSection}>
            <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={({ pressed }) => [{ opacity: pressed ? 0.86 : 1 }]}>
              <LinearGradient
                colors={['rgba(62,214,133,1)', 'rgba(36,186,105,1)', 'rgba(20,144,83,1)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.addExerciseButton}
              >
                <View style={styles.addExerciseIconWrap}>
                  <Plus size={18} color="#08100C" />
                </View>
                <AppText weight="800" style={styles.addExerciseText}>
                  Add exercises
                </AppText>
              </LinearGradient>
            </Pressable>

            <Pressable accessibilityRole="button" onPress={handleCancelWorkout} style={({ pressed }) => [{ opacity: pressed ? 0.84 : 1 }]}>
              <LinearGradient
                colors={['rgba(242,95,92,0.2)', 'rgba(168,53,61,0.24)', 'rgba(92,29,39,0.22)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.cancelButton, { borderColor: 'rgba(242,95,92,0.42)' }]}
              >
                <Trash2 size={16} color={theme.colors.danger} />
                <AppText weight="800" style={{ color: theme.colors.danger }}>
                  Cancel workout
                </AppText>
              </LinearGradient>
            </Pressable>
          </View>
        </ScrollView>

        <WorkoutKeyboard
          visible={Boolean(activeInput)}
          activeField={activeInput?.field ?? null}
          onDigit={handleDigit}
          onBackspace={handleBackspace}
          onDecimal={handleDecimal}
          onStep={handleStep}
          onRpeShortcut={handleRpeShortcut}
          onNext={handleNext}
        />
      </Animated.View>

      <ExercisePickerSheet
        visible={pickerOpen}
        exercises={exercises.data ?? []}
        selectedIds={selectedExerciseIds}
        onToggleSelection={(exerciseId) =>
          setSelectedExerciseIds((current) => {
            const next = new Set(current);
            if (next.has(exerciseId)) {
              next.delete(exerciseId);
            } else {
              next.add(exerciseId);
            }
            return next;
          })
        }
        onClose={() => {
          setPickerOpen(false);
          setSelectedExerciseIds(new Set());
        }}
        onAddSelected={handleAddExercises}
        previousPerformanceByExerciseId={previousPerformanceByExerciseId}
      />

      <SetTypeMenu
        visible={Boolean(setTypeSetId)}
        onClose={() => setSetTypeSetId(null)}
        onSelect={handleSetTypeChange}
      />
    </View>
  );
}

function sanitizeValue(value: string): string {
  return value.replace(/,/g, '.').replace(/[^0-9.-]/g, '');
}

function formatNumeric(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return String(Math.round(value));
  }
  return String(Math.round(value * 10) / 10);
}

function toOptionalNumber(value: string): number | null {
  const parsed = Number.parseFloat(value.replace(',', '.').trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

function toOptionalInteger(value: string): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'flex-end',
    zIndex: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,10,12,0.42)',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    maxHeight: '92%',
    minHeight: '68%',
    paddingHorizontal: 14,
    paddingTop: 6,
  },
  handleWrap: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  handle: {
    borderRadius: 999,
    height: 4,
    width: 50,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 8,
  },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  headerCopy: {
    flex: 1,
    gap: 1,
  },
  finishButton: {
    minHeight: 34,
  },
  workoutControls: {
    gap: 8,
    paddingTop: 2,
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginTop: 4,
    paddingHorizontal: 16,
    paddingVertical: 24,
  },
  emptyIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 56,
    justifyContent: 'center',
    marginBottom: 4,
    width: 56,
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  pauseChip: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  actionSection: {
    gap: 12,
    marginTop: 4,
    paddingBottom: 4,
  },
  addExerciseButton: {
    alignItems: 'center',
    borderRadius: 16,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  addExerciseIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(236,255,245,0.42)',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  addExerciseText: {
    color: '#08100C',
    fontSize: 15,
  },
  cancelButton: {
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
});
