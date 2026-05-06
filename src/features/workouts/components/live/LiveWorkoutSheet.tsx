import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronDown, ChevronUp, Dumbbell, Pause, Play, Plus, Trash2, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
import { ExercisePickerSheet } from '@/features/workouts/components/live/ExercisePickerSheet';
import { SetLoggingTable, WorkoutSetDraft } from '@/features/workouts/components/live/SetLoggingTable';
import { SetTypeMenu } from '@/features/workouts/components/live/SetTypeMenu';
import { WorkoutKeyboard } from '@/features/workouts/components/live/WorkoutKeyboard';
import { useLiveWorkoutOverlayStore } from '@/features/workouts/stores/liveWorkoutOverlayStore';
import { elapsedSecondsSince, formatElapsed } from '@/features/workouts/utils/liveWorkout';
import { useExercises, useRecentWorkouts, useWorkoutSession } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

interface Props {
  sessionId: string;
  expanded: boolean;
  bottomInset: number;
  miniBottom: number;
  miniHorizontalInset: number;
  onExpand: () => void;
  onMinimize: () => void;
}

type Nav = NativeStackNavigationProp<RootStackParamList>;
type EditableField = 'weightKg' | 'reps';

const COLLAPSED_HEIGHT = 62;
const CONTENT_HORIZONTAL_PADDING = 16;
const MAX_WEIGHT_KG = 9999.9;
const MAX_WEIGHT_INTEGER_DIGITS = 4;
const MAX_WEIGHT_DECIMAL_DIGITS = 1;
const MAX_REPS = 999;
const MAX_REPS_DIGITS = 3;
const MAX_RPE = 10;

export function LiveWorkoutSheet({ sessionId, expanded, bottomInset, miniBottom, miniHorizontalInset, onExpand, onMinimize }: Props) {
  const theme = useAppTheme();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
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
  const expandedTop = Math.max(insets.top + 6, 6);
  const hostBottomInset = expanded ? 0 : miniBottom;
  const hostHeight = Math.max(0, screenHeight - hostBottomInset);
  const sheetHeight = Math.max(COLLAPSED_HEIGHT + 20, hostHeight - expandedTop);
  const collapsedOffset = Math.max(0, sheetHeight - COLLAPSED_HEIGHT);
  const collapseRange = Math.max(collapsedOffset, 1);
  const translateY = useRef(new Animated.Value(expanded ? 0 : collapsedOffset)).current;
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
    Animated.spring(translateY, {
      toValue: expanded ? 0 : collapsedOffset,
      tension: 88,
      friction: 16,
      useNativeDriver: true,
    }).start();
  }, [collapsedOffset, expanded, translateY]);

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
    queryClient.invalidateQueries({ queryKey: queryKeys.completedWorkoutCount });
    queryClient.invalidateQueries({ queryKey: queryKeys.progress });
    queryClient.invalidateQueries({ queryKey: queryKeys.workout(sessionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
    setActiveWorkout({ hasActiveWorkout: false, sessionId: null });
    setSessionId(null);
    onMinimize();
    navigation.navigate('WorkoutCompletion', { sessionId });
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
  const completedSetFieldErrors = useMemo(() => {
    if (!session.data) {
      return {} as Record<string, { reps: boolean }>;
    }

    const errors: Record<string, { reps: boolean }> = {};
    for (const exercise of session.data.exercises) {
      for (const set of exercise.sets) {
        if (!set.isCompleted) {
          continue;
        }
        const draft = draftBySetId[set.id];
        const reps = toOptionalInteger(draft?.reps ?? (set.reps != null ? String(set.reps) : ''), 0, MAX_REPS);
        const repsMissing = reps == null;
        if (repsMissing) {
          errors[set.id] = { reps: true };
        }
      }
    }
    return errors;
  }, [draftBySetId, session.data]);
  const invalidCompletedSetCount = useMemo(() => Object.keys(completedSetFieldErrors).length, [completedSetFieldErrors]);

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
      weightKg: toOptionalNumber(draft.weightKg, 0, MAX_WEIGHT_KG),
      reps: toOptionalInteger(draft.reps, 0, MAX_REPS),
      rpe: toOptionalNumber(draft.rpe, 0, MAX_RPE),
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

  const clearTransientUi = useCallback(() => {
    commitActiveDraftRef.current();
    setActiveInput(null);
    setPickerOpen(false);
    setSelectedExerciseIds(new Set());
    setSetTypeSetId(null);
  }, []);

  const collapseSheet = useCallback(() => {
    clearTransientUi();
    onMinimize();
  }, [clearTransientUi, onMinimize]);

  const expandSheet = useCallback(() => {
    onExpand();
  }, [onExpand]);

  useEffect(() => {
    if (expanded) {
      return;
    }
    commitActiveDraftRef.current();
    setActiveInput(null);
  }, [expanded]);

  const updateDraftField = (setId: string, field: EditableField | 'rpe', updater: (value: string) => string) => {
    setDraftBySetId((current) => {
      const existing = current[setId] ?? { weightKg: '', reps: '', rpe: '' };
      return {
        ...current,
        [setId]: {
          ...existing,
          [field]: sanitizeValue(updater(existing[field]), field),
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
        return String(Math.max(0, Math.min(MAX_REPS, Math.round(next))));
      }
      return formatNumeric(Math.max(0, Math.min(MAX_WEIGHT_KG, Math.round(next * 10) / 10)));
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
    setActiveInput({ setId, field });
  };

  const dismissActiveInput = () => {
    if (!activeInput) {
      return;
    }
    commitDraftForSet(activeInput.setId);
    setActiveInput(null);
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
    if (invalidCompletedSetCount > 0) {
      Alert.alert('Missing reps', 'Fill in reps for all completed sets before finishing the workout.');
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

  const backdropOpacity = translateY.interpolate({
    inputRange: [0, collapseRange],
    outputRange: [0.3, 0],
    extrapolate: 'clamp',
  });

  const expandedProgress = translateY.interpolate({
    inputRange: [0, collapseRange],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const finishTranslate = translateY.interpolate({
    inputRange: [0, collapseRange],
    outputRange: [0, 10],
    extrapolate: 'clamp',
  });

  const contentOpacity = expandedProgress.interpolate({
    inputRange: [0, 0.14, 1],
    outputRange: [0, 0, 1],
    extrapolate: 'clamp',
  });

  const contentTranslateY = expandedProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 0],
    extrapolate: 'clamp',
  });

  if (!session.data) {
    return null;
  }

  return (
    <View style={styles.overlay} pointerEvents="box-none">
      <Animated.View pointerEvents="none" style={[styles.backdrop, { opacity: backdropOpacity }]} />
      <Pressable pointerEvents={expanded ? 'auto' : 'none'} style={StyleSheet.absoluteFill} onPress={collapseSheet} />

      <View style={[styles.sheetHost, { bottom: hostBottomInset }]} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.sheet,
            {
              top: expandedTop,
              bottom: expanded ? 0 : undefined,
              height: expanded ? undefined : COLLAPSED_HEIGHT,
              left: expanded ? 0 : miniHorizontalInset,
              right: expanded ? 0 : miniHorizontalInset,
              borderRadius: expanded ? 0 : 20,
              borderWidth: expanded ? 0 : StyleSheet.hairlineWidth,
              borderColor: expanded ? theme.colors.border : 'rgba(122,146,170,0.42)',
              backgroundColor: expanded ? '#141A22' : 'rgba(18,27,37,0.97)',
              shadowOpacity: expanded ? 0.32 : 0.26,
              shadowRadius: expanded ? 16 : 16,
              shadowOffset: { width: 0, height: expanded ? -6 : 8 },
              elevation: expanded ? 0 : 14,
              transform: [{ translateY }],
            },
          ]}
        >
          {expanded ? (
            <View style={[styles.dragZone, { paddingHorizontal: CONTENT_HORIZONTAL_PADDING }]}>
              <View style={styles.headerRow}>
                <Pressable
                  onPress={collapseSheet}
                  style={({ pressed }) => [styles.headerIcon, { borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 }]}
                >
                  <ChevronDown size={17} color={theme.colors.text} />
                </Pressable>

                <View style={[styles.headerCopy, styles.headerCopyOffset]}>
                  <AppText variant="section" weight="800" numberOfLines={1} style={styles.workoutTitle}>
                    {session.data.title}
                  </AppText>
                  <AppText muted variant="small" numberOfLines={1} style={styles.workoutMeta}>
                    {headerMeta}
                  </AppText>
                </View>

                <View style={styles.headerActions}>
                  <Pressable
                    onPress={() => toggleTimer(elapsedSeconds)}
                    style={({ pressed }) => [
                      styles.timerControl,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceAlt,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    {timerPaused ? <Play size={15} color={theme.colors.text} /> : <Pause size={15} color={theme.colors.text} />}
                  </Pressable>

                  <Animated.View
                    pointerEvents="auto"
                    style={[
                      styles.finishWrap,
                      {
                        opacity: expandedProgress,
                        transform: [{ translateX: finishTranslate }],
                      },
                    ]}
                  >
                    <Button
                      label="Finish"
                      icon={Check}
                      onPress={handleFinish}
                      disabled={finishMutation.isPending || finishAndUpdateRoutineMutation.isPending}
                      style={styles.finishButton}
                    />
                  </Animated.View>
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.miniPressable}>
              <LinearGradient
                colors={['rgba(22,33,44,0.98)', 'rgba(17,26,36,0.98)', 'rgba(13,21,30,0.98)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.miniGradient}
              >
                <Pressable onPress={expandSheet} style={({ pressed }) => [styles.miniMainPressable, { opacity: pressed ? 0.9 : 1 }]}>
                  <View style={styles.miniLeft}>
                    <View style={[styles.miniIconWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                      <ChevronUp size={15} color={theme.colors.text} />
                    </View>
                    <View style={styles.miniCopy}>
                      <AppText weight="800" numberOfLines={1} style={styles.miniTitle}>
                        {session.data.title}
                      </AppText>
                      <AppText muted variant="small" numberOfLines={1} style={styles.miniMeta}>
                        Active now • {formatElapsed(elapsedSeconds)}
                      </AppText>
                    </View>
                  </View>
                </Pressable>

                <View style={styles.miniActions}>
                  <Pressable
                    onPress={() => toggleTimer(elapsedSeconds)}
                    style={({ pressed }) => [
                      styles.miniActionButton,
                      {
                        borderColor: theme.colors.border,
                        backgroundColor: theme.colors.surfaceAlt,
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    {timerPaused ? <Play size={14} color={theme.colors.text} /> : <Pause size={14} color={theme.colors.text} />}
                  </Pressable>

                  <Pressable
                    onPress={discardMutation.isPending ? undefined : handleCancelWorkout}
                    style={({ pressed }) => [
                      styles.miniActionButton,
                      {
                        borderColor: 'rgba(242,95,92,0.36)',
                        backgroundColor: 'rgba(242,95,92,0.14)',
                        opacity: discardMutation.isPending ? 0.5 : pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    <X size={14} color={theme.colors.danger} />
                  </Pressable>
                </View>
              </LinearGradient>
            </View>
          )}

          <Animated.View
            pointerEvents={expanded ? 'auto' : 'none'}
            style={[
              styles.expandedContentWrap,
              styles.expandedContentOffset,
              { opacity: contentOpacity, transform: [{ translateY: contentTranslateY }] },
            ]}
          >
            <ScrollView
              scrollEnabled={expanded}
              contentContainerStyle={{
                paddingHorizontal: CONTENT_HORIZONTAL_PADDING,
                paddingBottom: activeInput ? 204 : bottomInset + 28,
                gap: 14,
              }}
              keyboardShouldPersistTaps="handled"
              onTouchStart={dismissActiveInput}
              showsVerticalScrollIndicator={expanded}
            >
              <View style={styles.progressRow}>
                <AppText muted variant="small" style={styles.progressText}>
                  {completedSets}/{totalSets} sets completed
                </AppText>
                <AppText muted variant="small" style={styles.progressText}>
                  {timerPaused ? 'Timer paused' : 'Timer running'}
                </AppText>
              </View>

              {session.data.exercises.length === 0 ? (
                <View style={[styles.emptyCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                  <View style={[styles.emptyIconWrap, { backgroundColor: 'rgba(53,199,122,0.16)' }]}>
                    <Dumbbell size={24} color={theme.colors.primary} />
                  </View>
                  <AppText variant="section" style={styles.emptyTitle}>
                    No exercises yet
                  </AppText>
                  <AppText muted style={styles.emptySubtitle}>
                    Add exercises to start logging your workout.
                  </AppText>
                </View>
              ) : (
                <SetLoggingTable
                  exercises={session.data.exercises}
                  draftBySetId={draftBySetId}
                  validationErrorsBySetId={completedSetFieldErrors}
                  activeInput={activeInput}
                  onSelectInput={handleSelectInput}
                  onOpenSetTypeMenu={setSetTypeSetId}
                  onToggleSetComplete={handleToggleSetComplete}
                  onAddSet={(workoutExerciseId) => addSetMutation.mutate(workoutExerciseId)}
                  onOpenHistory={(exerciseId) => navigation.navigate('ExerciseHistory', { exerciseId })}
                  onOpenExerciseMenu={handleOpenExerciseMenu}
                />
              )}

              <View style={[styles.actionSection, { borderTopColor: theme.colors.border }]}>
                <Pressable accessibilityRole="button" onPress={() => setPickerOpen(true)} style={({ pressed }) => [{ opacity: pressed ? 0.86 : 1 }]}>
                  <LinearGradient
                    colors={['rgba(58,210,129,0.82)', 'rgba(30,172,95,0.78)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.addExerciseButton, { borderColor: 'rgba(95,220,151,0.46)' }]}
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
                    <Trash2 size={14} color={theme.colors.danger} />
                    <AppText weight="700" style={[styles.cancelText, { color: theme.colors.danger }]}>
                      Cancel workout
                    </AppText>
                  </LinearGradient>
                </Pressable>
              </View>
            </ScrollView>
          </Animated.View>

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
      </View>

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

      <SetTypeMenu visible={Boolean(setTypeSetId)} onClose={() => setSetTypeSetId(null)} onSelect={handleSetTypeChange} />
    </View>
  );
}

function sanitizeValue(value: string, field: EditableField | 'rpe'): string {
  const normalized = value.replace(/,/g, '.');

  if (field === 'reps') {
    return normalized.replace(/\D/g, '').slice(0, MAX_REPS_DIGITS);
  }

  const cleaned = normalized.replace(/[^0-9.]/g, '');
  if (!cleaned) {
    return '';
  }

  const hasDot = cleaned.includes('.');
  const [rawInteger, ...decimalParts] = cleaned.split('.');
  const integer = rawInteger.replace(/^0+(?=\d)/, '').slice(0, MAX_WEIGHT_INTEGER_DIGITS) || '0';
  const decimal = decimalParts.join('').slice(0, MAX_WEIGHT_DECIMAL_DIGITS);

  if (!hasDot) {
    return integer;
  }
  return `${integer}.${decimal}`;
}

function formatNumeric(value: number): string {
  if (!Number.isFinite(value)) return '';
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return String(Math.round(value));
  }
  return String(Math.round(value * 10) / 10);
}

function toOptionalNumber(value: string, min: number, max: number): number | null {
  const parsed = Number.parseFloat(value.replace(',', '.').trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(max, Math.max(min, parsed));
}

function toOptionalInteger(value: string, min: number, max: number): number | null {
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Math.min(max, Math.max(min, parsed));
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#030507',
  },
  sheetHost: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  sheet: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    left: 8,
    overflow: 'hidden',
    position: 'absolute',
    right: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.32,
    shadowRadius: 16,
    bottom: 0,
  },
  dragZone: {
    paddingTop: 22,
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 6,
  },
  miniPressable: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  miniGradient: {
    alignItems: 'center',
    borderRadius: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: COLLAPSED_HEIGHT,
    paddingHorizontal: 10,
  },
  miniMainPressable: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 8,
  },
  miniLeft: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  miniIconWrap: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  miniCopy: {
    flex: 1,
    minWidth: 0,
  },
  miniTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  miniMeta: {
    fontSize: 11,
    lineHeight: 14,
  },
  miniActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    paddingLeft: 8,
  },
  miniActionButton: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  headerIcon: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  headerCopy: {
    flex: 1,
    gap: 0,
    minWidth: 0,
  },
  headerCopyOffset: {
    paddingTop: 5,
  },
  workoutTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  workoutMeta: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.9,
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  timerControl: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  finishWrap: {
    overflow: 'hidden',
  },
  finishButton: {
    borderRadius: 9,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 2,
  },
  expandedContentWrap: {
    flex: 1,
  },
  expandedContentOffset: {
    paddingTop: 14,
  },
  progressText: {
    fontSize: 12,
    lineHeight: 16,
  },
  emptyCard: {
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 7,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 20,
  },
  emptyIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 48,
    justifyContent: 'center',
    marginBottom: 2,
    width: 48,
  },
  emptySubtitle: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: 17,
    lineHeight: 22,
  },
  actionSection: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 8,
    marginTop: 14,
    paddingBottom: 2,
    paddingTop: 14,
  },
  addExerciseButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  addExerciseIconWrap: {
    alignItems: 'center',
    backgroundColor: 'rgba(236,255,245,0.42)',
    borderRadius: 999,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  addExerciseText: {
    color: '#08100C',
    fontSize: 15,
    lineHeight: 20,
  },
  cancelButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 12,
  },
  cancelText: {
    fontSize: 14,
    lineHeight: 19,
  },
});
