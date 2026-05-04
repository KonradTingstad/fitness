import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { Check, ChevronDown, ChevronRight, ChevronUp, Circle, Clock, Dumbbell, Flame, History, Pencil, Plus, Trash2, Trophy, Weight, Calendar } from 'lucide-react-native';
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/AppText';
import { Card } from '@/components/Card';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import {
  updateCompletedWorkoutSession,
  UpdateCompletedWorkoutInput,
} from '@/data/repositories/workoutRepository';
import { calculateWorkoutVolume } from '@/domain/calculations/workout';
import { Exercise, SetType, WorkoutExercise, WorkoutSession, WorkoutSet } from '@/domain/models';
import { ExercisePickerSheet } from '@/features/workouts/components/live/ExercisePickerSheet';
import { SetTypeMenu } from '@/features/workouts/components/live/SetTypeMenu';
import { useExercises, useRecentWorkouts, useWorkoutSession } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Route = RouteProp<RootStackParamList, 'WorkoutSummary'>;
type Nav = NativeStackNavigationProp<RootStackParamList>;

type PickerMode =
  | { kind: 'add' }
  | { kind: 'replace'; exerciseLocalId: string }
  | null;

interface WorkoutSetDraft {
  localId: string;
  id?: string;
  setType: SetType;
  weightKg: string;
  reps: string;
  rpe: string;
  rir: string;
  durationSeconds: string;
  distanceMeters: string;
  isCompleted: boolean;
  completedAt?: string | null;
}

interface WorkoutExerciseDraft {
  localId: string;
  id?: string;
  exerciseId: string;
  name: string;
  primaryMuscle: string;
  equipment: string;
  notes: string;
  sets: WorkoutSetDraft[];
}

interface WorkoutEditDraft {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  notes: string;
  exercises: WorkoutExerciseDraft[];
}

export function WorkoutSummaryScreen() {
  const theme = useAppTheme();
  const route = useRoute<Route>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const sessionId = route.params.sessionId;
  const startInEdit = Boolean(route.params.startInEdit);

  const session = useWorkoutSession(sessionId);
  const exercises = useExercises();
  const recent = useRecentWorkouts();

  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [draft, setDraft] = useState<WorkoutEditDraft | null>(null);
  const [pickerMode, setPickerMode] = useState<PickerMode>(null);
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());
  const [setTypeTarget, setSetTypeTarget] = useState<{ exerciseLocalId: string; setLocalId: string } | null>(null);
  const [hasAppliedAutoEdit, setHasAppliedAutoEdit] = useState(false);

  const exerciseById = useMemo(() => new Map((exercises.data ?? []).map((item) => [item.id, item])), [exercises.data]);

  const previousPerformanceByExerciseId = useMemo<Record<string, string | undefined>>(() => {
    const map: Record<string, string | undefined> = {};
    for (const workout of recent.data ?? []) {
      for (const workoutExercise of workout.exercises) {
        if (map[workoutExercise.exerciseId]) {
          continue;
        }
        const completed = workoutExercise.sets.find((set) => set.isCompleted);
        if (!completed) {
          continue;
        }
        const weight = completed.weightKg != null ? `${formatNumber(completed.weightKg)} kg` : null;
        const reps = completed.reps != null ? `${formatNumber(completed.reps)}` : null;
        map[workoutExercise.exerciseId] = weight && reps ? `${weight} × ${reps}` : reps ? `${reps} reps` : weight ? weight : undefined;
      }
    }
    return map;
  }, [recent.data]);

  const summaryMetrics = useMemo(() => {
    if (!session.data) {
      return {
        minutes: 0,
        totalSets: 0,
        completedSets: 0,
        totalReps: 0,
        totalVolumeKg: 0,
        prs: [] as Array<{ label: string; value: string }>,
      };
    }
    const sets = session.data.exercises.flatMap((exercise) => exercise.sets);
    const completed = sets.filter((set) => set.isCompleted);
    const durationSeconds = Math.max(
      0,
      Math.round(((session.data.endedAt ? new Date(session.data.endedAt) : new Date()).getTime() - new Date(session.data.startedAt).getTime()) / 1000),
    );
    return {
      minutes: Math.round(durationSeconds / 60),
      totalSets: sets.length,
      completedSets: completed.length,
      totalReps: completed.reduce((sum, set) => sum + (set.reps ?? 0), 0),
      totalVolumeKg: calculateWorkoutVolume(completed),
      prs: completed
        .filter((set) => (set.weightKg ?? 0) > (set.previousWeightKg ?? 0) && (set.reps ?? 0) >= (set.previousReps ?? 0))
        .map((set) => ({ label: 'Session PR', value: `${set.weightKg ?? 0} kg x ${set.reps ?? 0}` })),
    };
  }, [session.data]);

  const updateDraft = useCallback((updater: (current: WorkoutEditDraft) => WorkoutEditDraft) => {
    setDraft((current) => {
      if (!current) {
        return current;
      }
      return updater(current);
    });
    setIsDirty(true);
  }, []);

  const closePicker = useCallback(() => {
    setPickerMode(null);
    setPickerSelectedIds(new Set());
  }, []);

  const discardEditingState = useCallback(() => {
    closePicker();
    setSetTypeTarget(null);
    setDraft(null);
    setIsEditing(false);
    setIsDirty(false);
  }, [closePicker]);

  const startEditing = useCallback(() => {
    if (!session.data) {
      return;
    }
    setDraft(buildDraftFromSession(session.data));
    setIsEditing(true);
    setIsDirty(false);
    closePicker();
    setSetTypeTarget(null);
  }, [closePicker, session.data]);

  useEffect(() => {
    if (!startInEdit || hasAppliedAutoEdit || !session.data || isEditing) {
      return;
    }
    startEditing();
    setHasAppliedAutoEdit(true);
  }, [hasAppliedAutoEdit, isEditing, session.data, startEditing, startInEdit]);

  const handleCancelEdit = useCallback(() => {
    if (!isDirty) {
      discardEditingState();
      return;
    }
    Alert.alert('Discard changes?', 'Your workout edits have not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: discardEditingState },
    ]);
  }, [discardEditingState, isDirty]);

  const saveMutation = useMutation({
    mutationFn: (input: UpdateCompletedWorkoutInput) => updateCompletedWorkoutSession(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.workout(sessionId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentWorkouts });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
      queryClient.invalidateQueries({ queryKey: queryKeys.progress });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({
        predicate: (query) => {
          if (!Array.isArray(query.queryKey) || typeof query.queryKey[0] !== 'string') {
            return false;
          }
          const root = query.queryKey[0];
          return (
            root === 'workoutSessions' ||
            root === 'workoutPlans' ||
            root === 'programSchedule' ||
            root === 'programDayOutcomes' ||
            root === 'exerciseHistory' ||
            root === 'progressOverview' ||
            root === 'progressWidgets' ||
            root === 'progressWidgetData'
          );
        },
      });
      discardEditingState();
      Alert.alert('Workout updated', 'The completed workout has been updated.');
    },
    onError: (error) => {
      Alert.alert('Update workout', error instanceof Error ? error.message : 'Unable to update workout.');
    },
  });

  const handleSaveEdit = useCallback(() => {
    if (!draft || saveMutation.isPending) {
      return;
    }

    const title = draft.title.trim();
    if (!title) {
      Alert.alert('Cannot save', 'Workout name is required.');
      return;
    }

    const startedAt = buildIsoFromLocalInputs(draft.date, draft.startTime);
    const endedAt = buildIsoFromLocalInputs(draft.date, draft.endTime);
    if (!startedAt || !endedAt) {
      Alert.alert('Cannot save', 'Date, start time, and end time must be valid.');
      return;
    }

    if (Date.parse(startedAt) >= Date.parse(endedAt)) {
      Alert.alert('Cannot save', 'Start time must be before end time.');
      return;
    }

    for (const [exerciseIndex, exercise] of draft.exercises.entries()) {
      if (!exercise.exerciseId.trim()) {
        Alert.alert('Cannot save', `Exercise ${exerciseIndex + 1} is missing a valid exercise id.`);
        return;
      }
      if (!exercise.sets.length) {
        Alert.alert('Cannot save', `Exercise ${exerciseIndex + 1} must have at least one set.`);
        return;
      }

      for (const [setIndex, set] of exercise.sets.entries()) {
        const parsedWeight = parseOptionalDecimalField(set.weightKg);
        if (parsedWeight === 'invalid') {
          Alert.alert('Cannot save', `Weight is invalid in exercise ${exerciseIndex + 1}, set ${setIndex + 1}.`);
          return;
        }

        const parsedReps = parseOptionalIntegerField(set.reps);
        if (parsedReps === 'invalid') {
          Alert.alert('Cannot save', `Reps is invalid in exercise ${exerciseIndex + 1}, set ${setIndex + 1}.`);
          return;
        }

        const parsedRpe = parseOptionalDecimalField(set.rpe);
        if (parsedRpe === 'invalid') {
          Alert.alert('Cannot save', `RPE is invalid in exercise ${exerciseIndex + 1}, set ${setIndex + 1}.`);
          return;
        }

        const parsedRir = parseOptionalDecimalField(set.rir);
        if (parsedRir === 'invalid') {
          Alert.alert('Cannot save', `RIR is invalid in exercise ${exerciseIndex + 1}, set ${setIndex + 1}.`);
          return;
        }

        const parsedDuration = parseOptionalIntegerField(set.durationSeconds);
        if (parsedDuration === 'invalid') {
          Alert.alert('Cannot save', `Duration is invalid in exercise ${exerciseIndex + 1}, set ${setIndex + 1}.`);
          return;
        }

        const parsedDistance = parseOptionalDecimalField(set.distanceMeters);
        if (parsedDistance === 'invalid') {
          Alert.alert('Cannot save', `Distance is invalid in exercise ${exerciseIndex + 1}, set ${setIndex + 1}.`);
          return;
        }
      }
    }

    const payload: UpdateCompletedWorkoutInput = {
      sessionId,
      title,
      startedAt,
      endedAt,
      notes: draft.notes.trim() || null,
      exercises: draft.exercises.map((exercise) => ({
        id: exercise.id,
        exerciseId: exercise.exerciseId,
        notes: exercise.notes.trim() || null,
        supersetGroup: null,
        sets: exercise.sets.map((set) => {
          const weightKg = parseOptionalDecimalField(set.weightKg);
          const reps = parseOptionalIntegerField(set.reps);
          const rpe = parseOptionalDecimalField(set.rpe);
          const rir = parseOptionalDecimalField(set.rir);
          const durationSeconds = parseOptionalIntegerField(set.durationSeconds);
          const distanceMeters = parseOptionalDecimalField(set.distanceMeters);
          return {
            id: set.id,
            setType: set.setType,
            weightKg: weightKg === 'invalid' ? null : weightKg,
            reps: reps === 'invalid' ? null : reps,
            rpe: rpe === 'invalid' ? null : rpe,
            rir: rir === 'invalid' ? null : rir,
            durationSeconds: durationSeconds === 'invalid' ? null : durationSeconds,
            distanceMeters: distanceMeters === 'invalid' ? null : distanceMeters,
            isCompleted: set.isCompleted,
            completedAt: set.isCompleted ? set.completedAt ?? endedAt : null,
          };
        }),
      })),
    };

    saveMutation.mutate(payload);
  }, [draft, saveMutation, sessionId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      title: isEditing ? 'Edit Workout' : 'Workout Summary',
      headerTitleAlign: 'center',
      headerShadowVisible: false,
      headerStyle: {
        backgroundColor: theme.colors.background,
      },
      headerBackVisible: !isEditing,
      gestureEnabled: !isEditing,
      headerLeft: isEditing
        ? () => (
            <Pressable disabled={saveMutation.isPending} onPress={handleCancelEdit} style={({ pressed }) => [{ opacity: saveMutation.isPending ? 0.5 : pressed ? 0.72 : 1 }]}> 
              <AppText weight="700" style={{ color: theme.colors.muted }}>
                Cancel
              </AppText>
            </Pressable>
          )
        : undefined,
      headerRight: () =>
        isEditing ? (
          <Pressable disabled={saveMutation.isPending} onPress={handleSaveEdit} style={({ pressed }) => [{ opacity: saveMutation.isPending ? 0.5 : pressed ? 0.72 : 1 }]}> 
            <AppText weight="800" style={{ color: theme.colors.primary }}>
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </AppText>
          </Pressable>
        ) : (
          <Pressable
            onPress={startEditing}
            style={({ pressed }) => [
              styles.editHeaderButton,
              {
                borderColor: 'rgba(53,199,122,0.35)',
                backgroundColor: 'rgba(53,199,122,0.12)',
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          > 
            <Pencil size={14} color={theme.colors.primary} />
            <AppText weight="700" variant="small" style={{ color: theme.colors.primary }}>
              Edit
            </AppText>
          </Pressable>
        ),
    });
  }, [handleCancelEdit, handleSaveEdit, isEditing, navigation, saveMutation.isPending, startEditing, theme.colors.background, theme.colors.muted, theme.colors.primary]);

  const toggleSetCompleted = useCallback((exerciseLocalId: string, setLocalId: string) => {
    updateDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.localId !== exerciseLocalId
          ? exercise
          : {
              ...exercise,
              sets: exercise.sets.map((set) =>
                set.localId !== setLocalId
                  ? set
                  : {
                      ...set,
                      isCompleted: !set.isCompleted,
                      completedAt: !set.isCompleted ? new Date().toISOString() : null,
                    },
              ),
            },
      ),
    }));
  }, [updateDraft]);

  const durationPreview = useMemo(() => {
    if (!draft) {
      return '--';
    }
    const startedAt = buildIsoFromLocalInputs(draft.date, draft.startTime);
    const endedAt = buildIsoFromLocalInputs(draft.date, draft.endTime);
    if (!startedAt || !endedAt) {
      return '--';
    }
    const diffMs = Date.parse(endedAt) - Date.parse(startedAt);
    if (!Number.isFinite(diffMs) || diffMs <= 0) {
      return '--';
    }
    const totalMinutes = Math.round(diffMs / 60000);
    if (totalMinutes < 60) {
      return `${totalMinutes}m`;
    }
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }, [draft]);

  if (session.isLoading || !session.data) {
    return <LoadingState label="Summarizing workout" />;
  }

  const workoutDateLabel = formatWorkoutDateTimeLabel(session.data.startedAt, session.data.endedAt);
  const workoutDurationLabel = formatDurationFromMinutes(summaryMetrics.minutes);
  const muscleGroupsLabel = summarizeMuscleGroups(session.data);

  const openAddExercisePicker = () => {
    setPickerMode({ kind: 'add' });
    setPickerSelectedIds(new Set());
  };

  const openReplaceExercisePicker = (exerciseLocalId: string) => {
    setPickerMode({ kind: 'replace', exerciseLocalId });
    setPickerSelectedIds(new Set());
  };

  const handlePickerToggleSelection = (exerciseId: string) => {
    if (pickerMode?.kind === 'replace') {
      setPickerSelectedIds(new Set([exerciseId]));
      return;
    }
    setPickerSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(exerciseId)) {
        next.delete(exerciseId);
      } else {
        next.add(exerciseId);
      }
      return next;
    });
  };

  const handlePickerApply = () => {
    if (!draft || !pickerMode || !pickerSelectedIds.size) {
      return;
    }
    const selectedIds = Array.from(pickerSelectedIds);
    if (pickerMode.kind === 'add') {
      updateDraft((current) => {
        const nextExercises = [...current.exercises];
        for (const selectedId of selectedIds) {
          const selectedExercise = exerciseById.get(selectedId);
          if (!selectedExercise) {
            continue;
          }
          nextExercises.push(createExerciseDraftFromLibrary(selectedExercise));
        }
        return { ...current, exercises: nextExercises };
      });
      closePicker();
      return;
    }

    const selectedExercise = exerciseById.get(selectedIds[0]);
    if (!selectedExercise) {
      closePicker();
      return;
    }

    updateDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) =>
        exercise.localId !== pickerMode.exerciseLocalId
          ? exercise
          : {
              ...exercise,
              exerciseId: selectedExercise.id,
              name: selectedExercise.name,
              primaryMuscle: selectedExercise.primaryMuscle,
              equipment: selectedExercise.equipment,
            },
      ),
    }));
    closePicker();
  };

  return (
    <>
      <Screen>
        {!isEditing || !draft ? (
          <>
            <LinearGradient
              colors={['rgba(26,34,44,0.98)', 'rgba(21,29,38,0.98)', 'rgba(15,22,30,0.98)']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.heroCard, { borderColor: theme.colors.border }]}
            >
              <View style={styles.heroGlowOrbTop} pointerEvents="none" />
              <View style={styles.heroGlowOrbBottom} pointerEvents="none" />
              <View style={styles.heroSubtleLine} pointerEvents="none" />

              <View style={styles.heroTopRow}>
                <View style={[styles.heroWorkoutBadge, { borderColor: 'rgba(53,199,122,0.36)', backgroundColor: 'rgba(53,199,122,0.14)' }]}>
                  <Dumbbell size={16} color={theme.colors.primary} />
                  <AppText variant="small" weight="700" style={{ color: theme.colors.primary }}>
                    Completed
                  </AppText>
                </View>
                <View style={[styles.heroMetaPill, { borderColor: theme.colors.border, backgroundColor: 'rgba(255,255,255,0.04)' }]}>
                  <Calendar size={13} color={theme.colors.muted} />
                  <AppText variant="small" muted>
                    Summary
                  </AppText>
                </View>
              </View>

              <View style={styles.heroTitleBlock}>
                <AppText variant="title" numberOfLines={2} style={styles.heroTitle}>
                  {session.data.title}
                </AppText>
                <AppText muted style={styles.heroDateLabel}>
                  {workoutDateLabel}
                </AppText>
                {session.data.notes ? (
                  <AppText muted variant="small" numberOfLines={2} style={styles.heroNotes}>
                    {session.data.notes}
                  </AppText>
                ) : null}
              </View>

              <View style={styles.heroStatsGrid}>
                <SummaryStatTile icon={Clock} label="Duration" value={workoutDurationLabel} />
                <SummaryStatTile icon={Check} label="Sets" value={`${summaryMetrics.completedSets}/${summaryMetrics.totalSets}`} />
                <SummaryStatTile icon={Dumbbell} label="Reps" value={String(summaryMetrics.totalReps)} />
                <SummaryStatTile icon={Weight} label="Volume" value={`${Math.round(summaryMetrics.totalVolumeKg)} kg`} />
              </View>

              <View style={[styles.heroMuscleRow, { borderColor: 'rgba(53,199,122,0.24)', backgroundColor: 'rgba(53,199,122,0.08)' }]}>
                <Flame size={14} color={theme.colors.primary} />
                <AppText muted variant="small" numberOfLines={1} style={styles.heroMuscleLabel}>
                  {muscleGroupsLabel}
                </AppText>
              </View>
            </LinearGradient>

            <Card style={styles.summarySectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIconWrap, { borderColor: 'rgba(53,199,122,0.3)', backgroundColor: 'rgba(53,199,122,0.12)' }]}>
                    <Dumbbell size={14} color={theme.colors.primary} />
                  </View>
                  <AppText variant="section">Exercises completed</AppText>
                </View>
                <AppText muted variant="small">
                  {session.data.exercises.length}
                </AppText>
              </View>

              {session.data.exercises.length ? (
                session.data.exercises.map((exercise) => {
                  const completedSets = exercise.sets.filter((set) => set.isCompleted).length;
                  return (
                    <Pressable
                      key={exercise.id}
                      onPress={() => navigation.navigate('ExerciseHistory', { exerciseId: exercise.exerciseId })}
                      style={({ pressed }) => [
                        styles.exerciseSummaryRow,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surfaceAlt,
                          opacity: pressed ? 0.84 : 1,
                        },
                      ]}
                    >
                      <View style={[styles.exerciseSummaryIcon, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                        <Dumbbell size={15} color={theme.colors.primary} />
                      </View>
                      <View style={styles.exerciseSummaryCopy}>
                        <AppText weight="800" numberOfLines={1}>
                          {exercise.exercise?.name ?? 'Exercise'}
                        </AppText>
                        <AppText muted variant="small" numberOfLines={1}>
                          {exercise.exercise?.primaryMuscle ?? 'Body'} • {exercise.exercise?.equipment ?? 'Equipment'}
                        </AppText>
                      </View>
                      <View style={styles.exerciseSummaryMeta}>
                        <AppText weight="800">{completedSets}</AppText>
                        <AppText muted variant="small">
                          sets
                        </AppText>
                      </View>
                      <ChevronRight size={16} color={theme.colors.muted} />
                    </Pressable>
                  );
                })
              ) : (
                <View style={[styles.emptySummaryState, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                  <AppText muted>No exercises logged for this workout.</AppText>
                </View>
              )}
            </Card>

            <Card style={styles.summarySectionCard}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleRow}>
                  <View style={[styles.sectionIconWrap, { borderColor: 'rgba(53,199,122,0.3)', backgroundColor: 'rgba(53,199,122,0.12)' }]}>
                    <Trophy size={14} color={theme.colors.primary} />
                  </View>
                  <AppText variant="section">PRs</AppText>
                </View>
                <AppText muted variant="small">
                  {summaryMetrics.prs.length}
                </AppText>
              </View>

              {summaryMetrics.prs.length ? (
                summaryMetrics.prs.map((pr, index) => (
                  <View key={`${pr.label}-${index}`} style={[styles.prSummaryRow, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                    <View style={styles.prSummaryLabelWrap}>
                      <AppText weight="700">{pr.label}</AppText>
                    </View>
                    <AppText weight="800" style={{ color: theme.colors.primary }}>
                      {pr.value}
                    </AppText>
                  </View>
                ))
              ) : (
                <View style={[styles.emptySummaryState, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}>
                  <AppText muted>No new PRs this session.</AppText>
                </View>
              )}
            </Card>
          </>
        ) : (
          <>
            <Card style={{ borderColor: theme.colors.primary }}>
              <View style={styles.editingBanner}>
                <Pencil size={14} color={theme.colors.primary} />
                <AppText weight="700" style={{ color: theme.colors.primary }}>
                  Editing completed workout
                </AppText>
              </View>
              <AppText muted variant="small">
                Save updates title, date/time, exercises, sets, and stats calculations.
              </AppText>
            </Card>

            <Card>
              <AppText variant="section">Workout details</AppText>
              <View style={styles.formGroup}>
                <AppText muted variant="small">
                  Workout name
                </AppText>
                <TextInput
                  value={draft.title}
                  onChangeText={(value) => updateDraft((current) => ({ ...current, title: value }))}
                  placeholder="Workout name"
                  placeholderTextColor={theme.colors.muted}
                  style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                />
              </View>

              <View style={styles.rowTwo}>
                <View style={styles.rowField}>
                  <AppText muted variant="small">
                    Date (YYYY-MM-DD)
                  </AppText>
                  <TextInput
                    value={draft.date}
                    onChangeText={(value) => updateDraft((current) => ({ ...current, date: sanitizeDateInput(value) }))}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="2026-05-04"
                    placeholderTextColor={theme.colors.muted}
                    style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                  />
                </View>
                <View style={styles.rowField}>
                  <AppText muted variant="small">
                    Duration
                  </AppText>
                  <View style={[styles.metricValueWrap, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}> 
                    <Clock size={14} color={theme.colors.muted} />
                    <AppText weight="700">{durationPreview}</AppText>
                  </View>
                </View>
              </View>

              <View style={styles.rowTwo}>
                <View style={styles.rowField}>
                  <AppText muted variant="small">
                    Start (HH:mm)
                  </AppText>
                  <TextInput
                    value={draft.startTime}
                    onChangeText={(value) => updateDraft((current) => ({ ...current, startTime: sanitizeTimeInput(value) }))}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="07:30"
                    placeholderTextColor={theme.colors.muted}
                    style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                  />
                </View>
                <View style={styles.rowField}>
                  <AppText muted variant="small">
                    End (HH:mm)
                  </AppText>
                  <TextInput
                    value={draft.endTime}
                    onChangeText={(value) => updateDraft((current) => ({ ...current, endTime: sanitizeTimeInput(value) }))}
                    keyboardType="numbers-and-punctuation"
                    autoCapitalize="none"
                    autoCorrect={false}
                    placeholder="09:00"
                    placeholderTextColor={theme.colors.muted}
                    style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
                  />
                </View>
              </View>

              <View style={styles.formGroup}>
                <AppText muted variant="small">
                  Notes (optional)
                </AppText>
                <TextInput
                  value={draft.notes}
                  onChangeText={(value) => updateDraft((current) => ({ ...current, notes: value }))}
                  placeholder="Session notes"
                  placeholderTextColor={theme.colors.muted}
                  multiline
                  textAlignVertical="top"
                  style={[
                    styles.textInput,
                    styles.notesInput,
                    { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt },
                  ]}
                />
              </View>
            </Card>

            <Card>
              <View style={styles.spaceBetween}>
                <View>
                  <AppText variant="section">Exercises</AppText>
                  <AppText muted variant="small">
                    {draft.exercises.length} exercise{draft.exercises.length === 1 ? '' : 's'}
                  </AppText>
                </View>
                <Pressable
                  onPress={openAddExercisePicker}
                  style={({ pressed }) => [
                    styles.addPill,
                    {
                      borderColor: theme.colors.primary,
                      backgroundColor: 'rgba(53,199,122,0.12)',
                      opacity: pressed ? 0.82 : 1,
                    },
                  ]}
                >
                  <Plus size={13} color={theme.colors.primary} />
                  <AppText weight="700" variant="small" style={{ color: theme.colors.primary }}>
                    Add exercise
                  </AppText>
                </Pressable>
              </View>

              {draft.exercises.length ? (
                draft.exercises.map((exercise, exerciseIndex) => (
                  <View key={exercise.localId} style={[styles.exerciseCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}> 
                    <View style={styles.exerciseCardHeader}>
                      <View style={styles.grow}>
                        <AppText weight="800" style={styles.exerciseName}>
                          {exercise.name}
                        </AppText>
                        <AppText muted variant="small">
                          {exercise.primaryMuscle || 'Body'} • {exercise.equipment || 'Equipment'}
                        </AppText>
                      </View>
                      <View style={styles.iconActionRow}>
                        <IconActionButton
                          icon={History}
                          onPress={() => navigation.navigate('ExerciseHistory', { exerciseId: exercise.exerciseId })}
                        />
                        <IconActionButton icon={Pencil} onPress={() => openReplaceExercisePicker(exercise.localId)} />
                        <IconActionButton
                          icon={ChevronUp}
                          disabled={exerciseIndex === 0}
                          onPress={() =>
                            updateDraft((current) => ({
                              ...current,
                              exercises: swapItems(current.exercises, exerciseIndex, exerciseIndex - 1),
                            }))
                          }
                        />
                        <IconActionButton
                          icon={ChevronDown}
                          disabled={exerciseIndex === draft.exercises.length - 1}
                          onPress={() =>
                            updateDraft((current) => ({
                              ...current,
                              exercises: swapItems(current.exercises, exerciseIndex, exerciseIndex + 1),
                            }))
                          }
                        />
                        <IconActionButton
                          icon={Trash2}
                          tone="danger"
                          onPress={() =>
                            Alert.alert('Remove exercise?', 'This deletes the exercise and all of its sets from this workout.', [
                              { text: 'Keep', style: 'cancel' },
                              {
                                text: 'Remove',
                                style: 'destructive',
                                onPress: () =>
                                  updateDraft((current) => ({
                                    ...current,
                                    exercises: current.exercises.filter((item) => item.localId !== exercise.localId),
                                  })),
                              },
                            ])
                          }
                        />
                      </View>
                    </View>

                    <View style={styles.formGroup}>
                      <AppText muted variant="small">
                        Exercise notes (optional)
                      </AppText>
                      <TextInput
                        value={exercise.notes}
                        onChangeText={(value) =>
                          updateDraft((current) => ({
                            ...current,
                            exercises: current.exercises.map((item) =>
                              item.localId === exercise.localId ? { ...item, notes: value } : item,
                            ),
                          }))
                        }
                        placeholder="Notes for this exercise"
                        placeholderTextColor={theme.colors.muted}
                        style={[styles.textInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
                      />
                    </View>

                    {exercise.sets.map((set, setIndex) => (
                      <View key={set.localId} style={[styles.setCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}> 
                        <View style={styles.setTopRow}>
                          <Pressable
                            onPress={() => setSetTypeTarget({ exerciseLocalId: exercise.localId, setLocalId: set.localId })}
                            style={({ pressed }) => [
                              styles.setTypePill,
                              {
                                borderColor: theme.colors.border,
                                backgroundColor: theme.colors.surfaceAlt,
                                opacity: pressed ? 0.82 : 1,
                              },
                            ]}
                          >
                            <AppText variant="small" weight="700">
                              {setTypeLabel(set.setType)}
                            </AppText>
                          </Pressable>

                          <AppText muted variant="small">
                            Set {setIndex + 1}
                          </AppText>

                          <Pressable
                            onPress={() => toggleSetCompleted(exercise.localId, set.localId)}
                            style={({ pressed }) => [styles.completedToggle, { opacity: pressed ? 0.82 : 1 }]}
                          >
                            {set.isCompleted ? <Check size={16} color={theme.colors.primary} /> : <Circle size={16} color={theme.colors.muted} />}
                            <AppText muted variant="small">
                              Done
                            </AppText>
                          </Pressable>

                          <View style={styles.iconActionRow}>
                            <IconActionButton
                              icon={ChevronUp}
                              disabled={setIndex === 0}
                              onPress={() =>
                                updateDraft((current) => ({
                                  ...current,
                                  exercises: current.exercises.map((item) =>
                                    item.localId !== exercise.localId
                                      ? item
                                      : { ...item, sets: swapItems(item.sets, setIndex, setIndex - 1) },
                                  ),
                                }))
                              }
                            />
                            <IconActionButton
                              icon={ChevronDown}
                              disabled={setIndex === exercise.sets.length - 1}
                              onPress={() =>
                                updateDraft((current) => ({
                                  ...current,
                                  exercises: current.exercises.map((item) =>
                                    item.localId !== exercise.localId
                                      ? item
                                      : { ...item, sets: swapItems(item.sets, setIndex, setIndex + 1) },
                                  ),
                                }))
                              }
                            />
                            <IconActionButton
                              icon={Trash2}
                              tone="danger"
                              onPress={() =>
                                updateDraft((current) => ({
                                  ...current,
                                  exercises: current.exercises.map((item) =>
                                    item.localId !== exercise.localId
                                      ? item
                                      : { ...item, sets: item.sets.filter((entry) => entry.localId !== set.localId) },
                                  ),
                                }))
                              }
                            />
                          </View>
                        </View>

                        <View style={styles.setFieldRow}>
                          <MiniField
                            label="Kg"
                            value={set.weightKg}
                            onChangeText={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                exercises: current.exercises.map((item) =>
                                  item.localId !== exercise.localId
                                    ? item
                                    : {
                                        ...item,
                                        sets: item.sets.map((entry) =>
                                          entry.localId === set.localId
                                            ? { ...entry, weightKg: sanitizeDecimalInput(value) }
                                            : entry,
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                          <MiniField
                            label="Reps"
                            value={set.reps}
                            keyboardType="number-pad"
                            onChangeText={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                exercises: current.exercises.map((item) =>
                                  item.localId !== exercise.localId
                                    ? item
                                    : {
                                        ...item,
                                        sets: item.sets.map((entry) =>
                                          entry.localId === set.localId
                                            ? { ...entry, reps: sanitizeIntegerInput(value) }
                                            : entry,
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                          <MiniField
                            label="RPE"
                            value={set.rpe}
                            onChangeText={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                exercises: current.exercises.map((item) =>
                                  item.localId !== exercise.localId
                                    ? item
                                    : {
                                        ...item,
                                        sets: item.sets.map((entry) =>
                                          entry.localId === set.localId
                                            ? { ...entry, rpe: sanitizeDecimalInput(value) }
                                            : entry,
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                        </View>

                        <View style={styles.setFieldRow}>
                          <MiniField
                            label="RIR"
                            value={set.rir}
                            onChangeText={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                exercises: current.exercises.map((item) =>
                                  item.localId !== exercise.localId
                                    ? item
                                    : {
                                        ...item,
                                        sets: item.sets.map((entry) =>
                                          entry.localId === set.localId
                                            ? { ...entry, rir: sanitizeDecimalInput(value) }
                                            : entry,
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                          <MiniField
                            label="Time (s)"
                            value={set.durationSeconds}
                            keyboardType="number-pad"
                            onChangeText={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                exercises: current.exercises.map((item) =>
                                  item.localId !== exercise.localId
                                    ? item
                                    : {
                                        ...item,
                                        sets: item.sets.map((entry) =>
                                          entry.localId === set.localId
                                            ? { ...entry, durationSeconds: sanitizeIntegerInput(value) }
                                            : entry,
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                          <MiniField
                            label="Dist (m)"
                            value={set.distanceMeters}
                            onChangeText={(value) =>
                              updateDraft((current) => ({
                                ...current,
                                exercises: current.exercises.map((item) =>
                                  item.localId !== exercise.localId
                                    ? item
                                    : {
                                        ...item,
                                        sets: item.sets.map((entry) =>
                                          entry.localId === set.localId
                                            ? { ...entry, distanceMeters: sanitizeDecimalInput(value) }
                                            : entry,
                                        ),
                                      },
                                ),
                              }))
                            }
                          />
                        </View>
                      </View>
                    ))}

                    <Pressable
                      onPress={() =>
                        updateDraft((current) => ({
                          ...current,
                          exercises: current.exercises.map((item) =>
                            item.localId !== exercise.localId
                              ? item
                              : { ...item, sets: [...item.sets, createSetDraft()] },
                          ),
                        }))
                      }
                      style={({ pressed }) => [
                        styles.addSetButton,
                        {
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                          opacity: pressed ? 0.82 : 1,
                        },
                      ]}
                    >
                      <Plus size={13} color={theme.colors.primary} />
                      <AppText weight="700" variant="small" style={{ color: theme.colors.primary }}>
                        Add set
                      </AppText>
                    </Pressable>
                  </View>
                ))
              ) : (
                <View style={[styles.emptyExerciseState, { borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}> 
                  <AppText muted>No exercises in this workout.</AppText>
                  <Pressable
                    onPress={openAddExercisePicker}
                    style={({ pressed }) => [
                      styles.addPill,
                      {
                        borderColor: theme.colors.primary,
                        backgroundColor: 'rgba(53,199,122,0.12)',
                        opacity: pressed ? 0.82 : 1,
                      },
                    ]}
                  >
                    <Plus size={13} color={theme.colors.primary} />
                    <AppText weight="700" variant="small" style={{ color: theme.colors.primary }}>
                      Add exercise
                    </AppText>
                  </Pressable>
                </View>
              )}
            </Card>
          </>
        )}
      </Screen>

      <ExercisePickerSheet
        visible={Boolean(pickerMode)}
        exercises={exercises.data ?? []}
        selectedIds={pickerSelectedIds}
        onToggleSelection={handlePickerToggleSelection}
        onClose={closePicker}
        onAddSelected={handlePickerApply}
        previousPerformanceByExerciseId={previousPerformanceByExerciseId}
      />

      <SetTypeMenu
        visible={Boolean(setTypeTarget)}
        onClose={() => setSetTypeTarget(null)}
        onSelect={(type) => {
          if (!setTypeTarget) {
            return;
          }
          updateDraft((current) => ({
            ...current,
            exercises: current.exercises.map((exercise) =>
              exercise.localId !== setTypeTarget.exerciseLocalId
                ? exercise
                : {
                    ...exercise,
                    sets: exercise.sets.map((set) =>
                      set.localId !== setTypeTarget.setLocalId ? set : { ...set, setType: type },
                    ),
                  },
            ),
          }));
        }}
      />
    </>
  );
}

function MiniField({
  label,
  value,
  onChangeText,
  keyboardType = 'decimal-pad',
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'decimal-pad' | 'number-pad';
}) {
  const theme = useAppTheme();
  return (
    <View style={styles.miniField}>
      <AppText muted variant="small">
        {label}
      </AppText>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder="-"
        placeholderTextColor={theme.colors.muted}
        style={[styles.miniInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceAlt }]}
      />
    </View>
  );
}

function IconActionButton({
  icon: Icon,
  onPress,
  disabled,
  tone = 'default',
}: {
  icon: typeof Pencil;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'default' | 'danger';
}) {
  const theme = useAppTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.iconAction,
        {
          borderColor: tone === 'danger' ? 'rgba(242,95,92,0.45)' : theme.colors.border,
          backgroundColor: tone === 'danger' ? 'rgba(242,95,92,0.12)' : theme.colors.surface,
          opacity: disabled ? 0.4 : pressed ? 0.78 : 1,
        },
      ]}
    >
      <Icon size={13} color={tone === 'danger' ? theme.colors.danger : theme.colors.text} />
    </Pressable>
  );
}

function SummaryStatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  const theme = useAppTheme();
  return (
    <View style={[styles.heroStatTile, { borderColor: theme.colors.border, backgroundColor: 'rgba(255,255,255,0.04)' }]}>
      <View style={[styles.heroStatIconWrap, { backgroundColor: 'rgba(53,199,122,0.14)' }]}>
        <Icon size={13} color={theme.colors.primary} />
      </View>
      <View style={styles.heroStatCopy}>
        <AppText muted variant="small" style={styles.heroStatLabel}>
          {label}
        </AppText>
        <AppText weight="800" style={styles.heroStatValue}>
          {value}
        </AppText>
      </View>
    </View>
  );
}

function buildDraftFromSession(session: WorkoutSession): WorkoutEditDraft {
  const startedAt = new Date(session.startedAt);
  const fallbackEnd = addDays(startedAt, 0);
  fallbackEnd.setHours(startedAt.getHours() + 1);
  const endedAt = session.endedAt ? new Date(session.endedAt) : fallbackEnd;

  return {
    title: session.title,
    date: formatDateInput(startedAt),
    startTime: formatTimeInput(startedAt),
    endTime: formatTimeInput(endedAt),
    notes: session.notes ?? '',
    exercises: session.exercises.map((exercise) => mapWorkoutExerciseToDraft(exercise)),
  };
}

function mapWorkoutExerciseToDraft(exercise: WorkoutExercise): WorkoutExerciseDraft {
  return {
    localId: createLocalId('exercise'),
    id: exercise.id,
    exerciseId: exercise.exerciseId,
    name: exercise.exercise?.name ?? 'Exercise',
    primaryMuscle: exercise.exercise?.primaryMuscle ?? 'Body',
    equipment: exercise.exercise?.equipment ?? 'Equipment',
    notes: exercise.notes ?? '',
    sets: exercise.sets.length
      ? exercise.sets.map((set) => mapWorkoutSetToDraft(set))
      : [createSetDraft()],
  };
}

function mapWorkoutSetToDraft(set: WorkoutSet): WorkoutSetDraft {
  return {
    localId: createLocalId('set'),
    id: set.id,
    setType: set.setType,
    weightKg: set.weightKg != null ? formatNumber(set.weightKg) : '',
    reps: set.reps != null ? formatNumber(set.reps) : '',
    rpe: set.rpe != null ? formatNumber(set.rpe) : '',
    rir: set.rir != null ? formatNumber(set.rir) : '',
    durationSeconds: set.durationSeconds != null ? formatNumber(set.durationSeconds) : '',
    distanceMeters: set.distanceMeters != null ? formatNumber(set.distanceMeters) : '',
    isCompleted: set.isCompleted,
    completedAt: set.completedAt,
  };
}

function createExerciseDraftFromLibrary(exercise: Exercise): WorkoutExerciseDraft {
  return {
    localId: createLocalId('exercise'),
    exerciseId: exercise.id,
    name: exercise.name,
    primaryMuscle: exercise.primaryMuscle,
    equipment: exercise.equipment,
    notes: '',
    sets: [createSetDraft()],
  };
}

function createSetDraft(): WorkoutSetDraft {
  return {
    localId: createLocalId('set'),
    setType: 'normal',
    weightKg: '',
    reps: '',
    rpe: '',
    rir: '',
    durationSeconds: '',
    distanceMeters: '',
    isCompleted: true,
    completedAt: null,
  };
}

function createLocalId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeInput(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function buildIsoFromLocalInputs(dateInput: string, timeInput: string): string | null {
  const dateMatch = dateInput.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeInput.trim().match(/^(\d{2}):(\d{2})$/);
  if (!dateMatch || !timeMatch) {
    return null;
  }
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);

  if (month < 1 || month > 12 || day < 1 || day > 31 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  const localDate = new Date(year, month - 1, day, hours, minutes, 0, 0);
  if (
    localDate.getFullYear() !== year ||
    localDate.getMonth() !== month - 1 ||
    localDate.getDate() !== day ||
    localDate.getHours() !== hours ||
    localDate.getMinutes() !== minutes
  ) {
    return null;
  }
  return localDate.toISOString();
}

function formatWorkoutDateTimeLabel(startedAtIso: string, endedAtIso?: string | null): string {
  const startedAt = new Date(startedAtIso);
  const endedAt = endedAtIso ? new Date(endedAtIso) : null;
  const dateLabel = startedAt.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const startTime = startedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  if (!endedAt) {
    return `${dateLabel} • ${startTime}`;
  }
  const endTime = endedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel} • ${startTime} – ${endTime}`;
}

function formatDurationFromMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function summarizeMuscleGroups(session: WorkoutSession): string {
  const groups = Array.from(
    new Set(
      session.exercises
        .map((exercise) => exercise.exercise?.primaryMuscle?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => toTitleCase(value)),
    ),
  );
  if (!groups.length) {
    return 'Muscle groups not available';
  }
  if (groups.length <= 3) {
    return groups.join(' • ');
  }
  return `${groups.slice(0, 3).join(' • ')} +${groups.length - 3}`;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function sanitizeDecimalInput(value: string): string {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [whole, ...rest] = normalized.split('.');
  if (!rest.length) {
    return whole;
  }
  return `${whole}.${rest.join('').slice(0, 2)}`;
}

function sanitizeIntegerInput(value: string): string {
  return value.replace(/[^0-9]/g, '');
}

function sanitizeDateInput(value: string): string {
  return value.replace(/[^0-9-]/g, '').slice(0, 10);
}

function sanitizeTimeInput(value: string): string {
  return value.replace(/[^0-9:]/g, '').slice(0, 5);
}

function parseOptionalDecimalField(value: string): number | null | 'invalid' {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) {
    return null;
  }
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return 'invalid';
  }
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 'invalid';
  }
  return Math.round(parsed * 100) / 100;
}

function parseOptionalIntegerField(value: string): number | null | 'invalid' {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  if (!/^\d+$/.test(normalized)) {
    return 'invalid';
  }
  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 'invalid';
  }
  return parsed;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return '';
  }
  if (Math.abs(value - Math.round(value)) < 0.001) {
    return String(Math.round(value));
  }
  return String(Math.round(value * 10) / 10);
}

function setTypeLabel(type: SetType): string {
  if (type === 'warmup') return 'Warmup';
  if (type === 'drop') return 'Dropset';
  if (type === 'failure') return 'Failure';
  if (type === 'assisted') return 'Assisted';
  if (type === 'bodyweight') return 'Bodyweight';
  if (type === 'timed') return 'Timed';
  return 'Normal';
}

function swapItems<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  if (!item) {
    return list;
  }
  next.splice(to, 0, item);
  return next;
}

const styles = StyleSheet.create({
  editHeaderButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  heroCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    padding: 14,
    position: 'relative',
  },
  heroGlowOrbTop: {
    backgroundColor: 'rgba(53,199,122,0.17)',
    borderRadius: 999,
    height: 160,
    position: 'absolute',
    right: -46,
    top: -66,
    width: 160,
  },
  heroGlowOrbBottom: {
    backgroundColor: 'rgba(53,199,122,0.11)',
    borderRadius: 999,
    bottom: -70,
    height: 180,
    left: -66,
    position: 'absolute',
    width: 180,
  },
  heroSubtleLine: {
    borderColor: 'rgba(255,255,255,0.05)',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 140,
    position: 'absolute',
    right: -24,
    top: 26,
    transform: [{ rotate: '-12deg' }],
    width: 230,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroWorkoutBadge: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  heroMetaPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    minHeight: 28,
    paddingHorizontal: 9,
  },
  heroTitleBlock: {
    gap: 4,
    marginTop: 10,
  },
  heroTitle: {
    fontSize: 25,
    lineHeight: 30,
  },
  heroDateLabel: {
    fontSize: 12,
    lineHeight: 16,
    opacity: 0.9,
  },
  heroNotes: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
    opacity: 0.88,
  },
  heroStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  heroStatTile: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 8,
    minHeight: 52,
    paddingHorizontal: 10,
    paddingVertical: 8,
    width: '48.5%',
  },
  heroStatIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  heroStatCopy: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  heroStatLabel: {
    fontSize: 10,
    lineHeight: 12,
  },
  heroStatValue: {
    fontSize: 15,
    lineHeight: 18,
  },
  heroMuscleRow: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  heroMuscleLabel: {
    flex: 1,
    lineHeight: 15,
  },
  summarySectionCard: {
    gap: 10,
    paddingBottom: 10,
  },
  sectionHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  sectionIconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  exerciseSummaryRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 9,
    minHeight: 62,
    paddingHorizontal: 10,
  },
  exerciseSummaryIcon: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  exerciseSummaryCopy: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  exerciseSummaryMeta: {
    alignItems: 'flex-end',
    minWidth: 40,
  },
  emptySummaryState: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 64,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  prSummaryRow: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  prSummaryLabelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  titleRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  grow: {
    flex: 1,
  },
  notesText: {
    marginTop: 4,
  },
  grid: {
    flexDirection: 'row',
    gap: 8,
  },
  editingBanner: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  formGroup: {
    gap: 6,
  },
  rowTwo: {
    flexDirection: 'row',
    gap: 10,
  },
  rowField: {
    flex: 1,
    gap: 6,
  },
  textInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 14,
    fontWeight: '700',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  notesInput: {
    minHeight: 86,
    paddingTop: 10,
  },
  metricValueWrap: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  spaceBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  addPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  exerciseCard: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 10,
    padding: 10,
  },
  exerciseCardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  exerciseName: {
    fontSize: 16,
    lineHeight: 20,
  },
  iconActionRow: {
    flexDirection: 'row',
    gap: 4,
  },
  iconAction: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  setCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 8,
  },
  setTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  setTypePill: {
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  completedToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    marginLeft: 'auto',
  },
  setFieldRow: {
    flexDirection: 'row',
    gap: 6,
  },
  miniField: {
    flex: 1,
    gap: 4,
  },
  miniInput: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 13,
    fontWeight: '700',
    minHeight: 34,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  addSetButton: {
    alignItems: 'center',
    borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'center',
    minHeight: 34,
  },
  emptyExerciseState: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 12,
  },
  exerciseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 34,
  },
});
