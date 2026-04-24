import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Check, Circle, Clock, Dumbbell, History, Pause, Plus, Square, TimerReset, Trash2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import {
  addExerciseToWorkout,
  addSet,
  completeWorkoutSet,
  discardWorkout,
  finishWorkout,
  updateWorkoutSet,
} from '@/data/repositories/workoutRepository';
import { SetType, WorkoutSet } from '@/domain/models';
import { useExercises, useWorkoutSession } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type LiveRoute = RouteProp<RootStackParamList, 'LiveWorkout'>;

const setTypes: SetType[] = ['warmup', 'normal', 'drop', 'failure', 'assisted', 'bodyweight', 'timed'];

export function LiveWorkoutScreen() {
  const theme = useAppTheme();
  const route = useRoute<LiveRoute>();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const session = useWorkoutSession(route.params.sessionId);
  const exercises = useExercises();
  const [restSeconds, setRestSeconds] = useState(0);
  const [restPaused, setRestPaused] = useState(false);
  const [elapsedNow, setElapsedNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setElapsedNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (restSeconds <= 0 || restPaused) return;
    const id = setInterval(() => setRestSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => clearInterval(id);
  }, [restPaused, restSeconds]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.workout(route.params.sessionId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const completeSetMutation = useMutation({
    mutationFn: (setId: string) => completeWorkoutSet(setId),
    onSuccess: async (seconds) => {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      invalidate();
      if (seconds) {
        setRestSeconds(seconds);
        setRestPaused(false);
      }
    },
  });

  const updateSetMutation = useMutation({
    mutationFn: ({ setId, patch }: { setId: string; patch: Partial<WorkoutSet> }) => updateWorkoutSet(setId, patch),
    onSuccess: invalidate,
  });

  const addSetMutation = useMutation({
    mutationFn: (workoutExerciseId: string) => addSet(workoutExerciseId),
    onSuccess: invalidate,
  });

  const addExerciseMutation = useMutation({
    mutationFn: (exerciseId: string) => addExerciseToWorkout(route.params.sessionId, exerciseId),
    onSuccess: invalidate,
  });

  const finishMutation = useMutation({
    mutationFn: () => finishWorkout(route.params.sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.recentWorkouts });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
      queryClient.invalidateQueries({ queryKey: queryKeys.progress });
      navigation.replace('WorkoutSummary', { sessionId: route.params.sessionId });
    },
  });

  const discardMutation = useMutation({
    mutationFn: () => discardWorkout(route.params.sessionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
      navigation.goBack();
    },
  });

  const elapsedLabel = useMemo(() => {
    if (!session.data) return '0:00';
    const seconds = Math.max(0, Math.floor((elapsedNow - new Date(session.data.startedAt).getTime()) / 1000));
    const mins = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${mins}:${sec.toString().padStart(2, '0')}`;
  }, [elapsedNow, session.data]);

  if (session.isLoading || !session.data) {
    return <LoadingState label="Opening live workout" />;
  }

  const completed = session.data.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.isCompleted).length;
  const total = session.data.exercises.flatMap((exercise) => exercise.sets).length;
  const firstExercise = exercises.data?.[0];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <Card style={{ borderColor: theme.colors.primary }}>
          <View style={styles.topBar}>
            <View>
              <AppText variant="section">{session.data.title}</AppText>
              <AppText muted>{completed}/{total} sets completed</AppText>
            </View>
            <View style={styles.timer}>
              <Clock color={theme.colors.primary} size={18} />
              <AppText weight="800">{elapsedLabel}</AppText>
            </View>
          </View>
        </Card>

        {restSeconds > 0 ? (
          <Card style={{ backgroundColor: theme.colors.surfaceAlt }}>
            <View style={styles.restRow}>
              <View>
                <AppText variant="section">Rest {formatSeconds(restSeconds)}</AppText>
                <AppText muted>Auto-started after set completion.</AppText>
              </View>
              <View style={styles.restActions}>
                <IconButton icon={restPaused ? TimerReset : Pause} onPress={() => setRestPaused((value) => !value)} />
                <IconButton icon={Plus} onPress={() => setRestSeconds((value) => value + 30)} />
                <IconButton icon={Square} onPress={() => setRestSeconds(0)} />
              </View>
            </View>
          </Card>
        ) : null}

        {session.data.exercises.length ? (
          session.data.exercises.map((exercise) => (
            <Card key={exercise.id}>
              <View style={styles.exerciseHeader}>
                <View style={styles.grow}>
                  <AppText variant="section">{exercise.exercise?.name ?? 'Exercise'}</AppText>
                  <AppText variant="small" muted>
                    {exercise.exercise?.primaryMuscle} • {exercise.exercise?.equipment}
                  </AppText>
                  {exercise.notes ? <AppText muted>{exercise.notes}</AppText> : null}
                </View>
                <Pressable onPress={() => navigation.navigate('ExerciseHistory', { exerciseId: exercise.exerciseId })} hitSlop={12}>
                  <History color={theme.colors.muted} size={20} />
                </Pressable>
              </View>

              <View style={[styles.setGrid, { borderBottomColor: theme.colors.border }]}>
                <AppText variant="small" muted>Set</AppText>
                <AppText variant="small" muted>Previous</AppText>
                <AppText variant="small" muted>kg</AppText>
                <AppText variant="small" muted>reps</AppText>
                <AppText variant="small" muted>Done</AppText>
              </View>

              {exercise.sets.map((set) => (
                <View key={set.id} style={[styles.setGrid, { borderBottomColor: theme.colors.border }]}>
                  <Pressable onPress={() => updateSetMutation.mutate({ setId: set.id, patch: { setType: nextSetType(set.setType) } })}>
                    <AppText weight="800" style={{ color: set.setType === 'normal' ? theme.colors.text : theme.colors.warning }}>
                      {setTypeLabel(set.setType, set.sortOrder)}
                    </AppText>
                  </Pressable>
                  <AppText variant="small" muted>
                    {set.previousWeightKg || set.previousReps ? `${set.previousWeightKg ?? 0} x ${set.previousReps ?? 0}` : '-'}
                  </AppText>
                  <TextInput
                    defaultValue={set.weightKg ? String(set.weightKg) : ''}
                    keyboardType="decimal-pad"
                    placeholder="-"
                    placeholderTextColor={theme.colors.muted}
                    onEndEditing={(event) =>
                      updateSetMutation.mutate({ setId: set.id, patch: { weightKg: parseOptionalNumber(event.nativeEvent.text) } })
                    }
                    style={[styles.setInput, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
                  />
                  <TextInput
                    defaultValue={set.reps ? String(set.reps) : ''}
                    keyboardType="number-pad"
                    placeholder="-"
                    placeholderTextColor={theme.colors.muted}
                    onEndEditing={(event) =>
                      updateSetMutation.mutate({ setId: set.id, patch: { reps: parseOptionalNumber(event.nativeEvent.text) } })
                    }
                    style={[styles.setInput, { color: theme.colors.text, backgroundColor: theme.colors.surfaceAlt }]}
                  />
                  <Pressable onPress={() => completeSetMutation.mutate(set.id)} style={[styles.check, { backgroundColor: set.isCompleted ? theme.colors.primary : theme.colors.surfaceAlt }]}>
                    {set.isCompleted ? <Check size={18} color="#08100C" /> : <Circle size={18} color={theme.colors.muted} />}
                  </Pressable>
                </View>
              ))}

              <Button label="Add set" icon={Plus} variant="secondary" onPress={() => addSetMutation.mutate(exercise.id)} />
            </Card>
          ))
        ) : (
          <EmptyState
            icon={Dumbbell}
            title="Empty workout"
            body="Add an exercise and start logging. The first set row is ready immediately."
            actionLabel={firstExercise ? `Add ${firstExercise.name}` : 'Add exercise'}
            onAction={() => firstExercise && addExerciseMutation.mutate(firstExercise.id)}
          />
        )}

        <View style={styles.footerActions}>
          <Button
            label="Discard"
            icon={Trash2}
            variant="danger"
            onPress={() =>
              Alert.alert('Discard workout?', 'This marks the draft as discarded.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Discard', style: 'destructive', onPress: () => discardMutation.mutate() },
              ])
            }
            style={styles.footerButton}
          />
          <Button
            label="Finish"
            icon={Check}
            onPress={() =>
              Alert.alert('Finish workout?', `${completed} completed sets will be saved.`, [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Finish', onPress: () => finishMutation.mutate() },
              ])
            }
            style={styles.footerButton}
          />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

function IconButton({ icon: Icon, onPress }: { icon: typeof Pause; onPress: () => void }) {
  const theme = useAppTheme();
  return (
    <Pressable onPress={onPress} style={[styles.iconButton, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <Icon size={18} color={theme.colors.text} />
    </Pressable>
  );
}

function parseOptionalNumber(value: string): number | null {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function nextSetType(current: SetType): SetType {
  const index = setTypes.indexOf(current);
  return setTypes[(index + 1) % setTypes.length];
}

function setTypeLabel(type: SetType, sortOrder: number): string {
  const prefix: Record<SetType, string> = {
    warmup: 'W',
    normal: String(sortOrder),
    drop: 'D',
    failure: 'F',
    assisted: 'A',
    bodyweight: 'B',
    timed: 'T',
  };
  return prefix[type];
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const sec = seconds % 60;
  return `${mins}:${sec.toString().padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  topBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  restRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  restActions: {
    flexDirection: 'row',
    gap: 8,
  },
  iconButton: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  exerciseHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  grow: {
    flex: 1,
    gap: 3,
  },
  setGrid: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 7,
    minHeight: 44,
    paddingVertical: 6,
  },
  setInput: {
    borderRadius: 8,
    fontSize: 14,
    fontWeight: '800',
    minHeight: 38,
    paddingHorizontal: 8,
    textAlign: 'center',
    width: 56,
  },
  check: {
    alignItems: 'center',
    borderRadius: 8,
    height: 38,
    justifyContent: 'center',
    width: 44,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  footerButton: {
    flex: 1,
  },
});
