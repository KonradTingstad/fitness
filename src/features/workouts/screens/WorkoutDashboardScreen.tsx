import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, endOfWeek, format, isSameDay, startOfWeek } from 'date-fns';
import {
  Calendar,
  Check,
  ChevronRight,
  Circle,
  Clock,
  Dumbbell,
  History,
  Minus,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
} from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { Exercise, Routine, WorkoutSession } from '@/domain/models';
import { startEmptyWorkout, startWorkoutFromRoutine } from '@/data/repositories/workoutRepository';
import { useActiveWorkout, useExercises, useRecentWorkouts, useRoutines } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type WorkoutTab = 'today' | 'program' | 'history' | 'exercises';
type ExerciseFilter = 'All' | 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms';
type ScheduleType = 'workout' | 'rest' | 'cardio' | 'recovery';

const WORKOUT_TABS: Array<{ key: WorkoutTab; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'program', label: 'Program' },
  { key: 'history', label: 'History' },
  { key: 'exercises', label: 'Exercises' },
];

const EXERCISE_FILTERS: ExerciseFilter[] = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms'];

const PROGRAM_WEEK: Array<{ day: string; title: string; type: ScheduleType }> = [
  { day: 'Mon', title: 'Upper', type: 'workout' },
  { day: 'Tue', title: 'Rest', type: 'rest' },
  { day: 'Wed', title: 'Lower', type: 'workout' },
  { day: 'Thu', title: 'Pull', type: 'workout' },
  { day: 'Fri', title: 'Rest', type: 'rest' },
  { day: 'Sat', title: 'Cardio', type: 'cardio' },
  { day: 'Sun', title: 'Recovery', type: 'recovery' },
];

interface ExerciseStats {
  prWeightKg?: number;
  prReps?: number;
  latestWeightKg?: number;
  latestReps?: number;
  latestDate?: string;
  latestTimestamp?: number;
}

function buildExerciseStats(recentWorkouts: WorkoutSession[]): Map<string, ExerciseStats> {
  const stats = new Map<string, ExerciseStats>();
  for (const workout of recentWorkouts) {
    for (const workoutExercise of workout.exercises) {
      for (const set of workoutExercise.sets.filter((item) => item.isCompleted)) {
        const next = stats.get(workoutExercise.exerciseId) ?? {};
        const timestamp = new Date(set.completedAt ?? workout.endedAt ?? workout.startedAt).getTime();
        if (set.weightKg != null && (next.prWeightKg == null || set.weightKg > next.prWeightKg)) {
          next.prWeightKg = set.weightKg;
          next.prReps = set.reps ?? undefined;
        }
        if (!next.latestTimestamp || timestamp > next.latestTimestamp) {
          next.latestTimestamp = timestamp;
          next.latestWeightKg = set.weightKg ?? undefined;
          next.latestReps = set.reps ?? undefined;
          next.latestDate = format(new Date(timestamp), 'd/M/yyyy');
        }
        stats.set(workoutExercise.exerciseId, next);
      }
    }
  }
  return stats;
}

function durationMinutes(workout: WorkoutSession): number {
  if (workout.endedAt) {
    return Math.max(1, Math.round((new Date(workout.endedAt).getTime() - new Date(workout.startedAt).getTime()) / 60000));
  }
  return Math.max(20, workout.exercises.length * 12);
}

function mapExerciseCategory(primaryMuscle: string): ExerciseFilter {
  const muscle = primaryMuscle.toLowerCase();
  if (muscle.includes('chest')) return 'Chest';
  if (muscle.includes('back') || muscle.includes('lat') || muscle.includes('posterior')) return 'Back';
  if (muscle.includes('shoulder') || muscle.includes('deltoid')) return 'Shoulders';
  if (muscle.includes('arm') || muscle.includes('bicep') || muscle.includes('tricep') || muscle.includes('forearm')) return 'Arms';
  if (muscle.includes('quad') || muscle.includes('hamstring') || muscle.includes('glute') || muscle.includes('leg') || muscle.includes('calf')) return 'Legs';
  return 'All';
}

function routinePreview(routine: Routine): string {
  return routine.exercises
    .slice(0, 4)
    .map((item) => item.exercise?.name)
    .filter(Boolean)
    .join(' • ');
}

export function WorkoutDashboardScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkoutTab>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseFilter>('All');

  const routines = useRoutines();
  const active = useActiveWorkout();
  const recent = useRecentWorkouts();
  const exercises = useExercises();

  const startRoutine = useMutation({
    mutationFn: (routineId: string) => startWorkoutFromRoutine(routineId),
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentWorkouts });
      navigation.navigate('LiveWorkout', { sessionId });
    },
  });

  const startEmpty = useMutation({
    mutationFn: () => startEmptyWorkout(),
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      navigation.navigate('LiveWorkout', { sessionId });
    },
  });

  if (routines.isLoading || recent.isLoading || active.isLoading || exercises.isLoading) {
    return <LoadingState label="Loading workouts" />;
  }

  const routineList = routines.data ?? [];
  const recentList = recent.data ?? [];
  const exerciseList = exercises.data ?? [];
  const suggestedRoutine = routineList[0];

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 1 });
  const weekLabel = `Week of ${format(weekStart, 'd MMM')}`;

  const workoutsThisWeek = recentList.filter((workout) => {
    const startedAt = new Date(workout.startedAt);
    return startedAt >= weekStart && startedAt <= weekEnd;
  });
  const completedDays = new Set(workoutsThisWeek.map((workout) => format(new Date(workout.startedAt), 'yyyy-MM-dd')));
  const weekMinutes = workoutsThisWeek.reduce((sum, workout) => sum + durationMinutes(workout), 0);

  const exerciseStats = buildExerciseStats(recentList);

  const filteredExercises = exerciseList.filter((exercise) => {
    const category = mapExerciseCategory(exercise.primaryMuscle);
    const matchesCategory = exerciseFilter === 'All' || category === exerciseFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch = !q || exercise.name.toLowerCase().includes(q) || exercise.primaryMuscle.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  const renderTabs = () => (
    <View style={[styles.tabsRow, { borderColor: theme.colors.border }]}>
      {WORKOUT_TABS.map((item) => {
        const activeTab = tab === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => setTab(item.key)}
            style={({ pressed }) => [
              styles.tabItem,
              { borderBottomColor: activeTab ? theme.colors.primary : 'transparent', opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <AppText weight={activeTab ? '800' : '600'} style={{ color: activeTab ? theme.colors.primary : theme.colors.muted }}>
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );

  const renderSavedRoutines = () =>
    routineList.length ? (
      routineList.map((routine) => {
        const sets = routine.exercises.reduce((sum, item) => sum + item.setTemplates.length, 0);
        return (
          <Card key={routine.id} onPress={() => startRoutine.mutate(routine.id)} style={styles.listCard}>
            <View style={styles.savedRow}>
              <View style={[styles.savedIcon, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                <Dumbbell size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.savedCopy}>
                <AppText weight="800" style={styles.savedTitle}>
                  {routine.name}
                </AppText>
                <AppText muted numberOfLines={2}>
                  {routinePreview(routine)}
                </AppText>
                <AppText variant="small" muted>
                  {routine.exercises.length} exercises
                </AppText>
              </View>
              <View style={[styles.setBadge, { backgroundColor: theme.colors.surfaceAlt }]}>
                <AppText muted>sets</AppText>
                <AppText weight="800" style={{ color: theme.colors.primary }}>
                  {sets}
                </AppText>
              </View>
              <ChevronRight size={22} color={theme.colors.muted} />
            </View>
          </Card>
        );
      })
    ) : (
      <EmptyState
        icon={Dumbbell}
        title="No routines yet"
        body="Start an empty workout and save templates as your training structure settles."
        actionLabel="Start empty"
        onAction={() => startEmpty.mutate()}
      />
    );

  const renderTodayTab = () => {
    const firstFive = PROGRAM_WEEK.slice(0, 5).map((day, index) => {
      const date = addDays(weekStart, index);
      const dateKey = format(date, 'yyyy-MM-dd');
      const isToday = isSameDay(date, new Date());
      const isPast = date < new Date() && !isToday;
      const done = completedDays.has(dateKey);

      if (day.type === 'rest') {
        return { ...day, status: isPast ? 'Rest' : isToday ? 'Rest' : 'Upcoming', tone: 'muted' as const, icon: Minus };
      }
      if (done) {
        return { ...day, status: 'Done', tone: 'good' as const, icon: Check };
      }
      if (isToday) {
        return { ...day, status: 'Today', tone: 'good' as const, icon: Circle };
      }
      if (isPast) {
        return { ...day, status: 'Missed', tone: 'muted' as const, icon: Minus };
      }
      return { ...day, status: 'Upcoming', tone: 'muted' as const, icon: Circle };
    });

    return (
      <>
        {active.data ? (
          <Card onPress={() => navigation.navigate('LiveWorkout', { sessionId: active.data!.id })} style={{ borderColor: theme.colors.warning }}>
            <View style={styles.spaceBetween}>
              <View>
                <AppText variant="section">Continue active workout</AppText>
                <AppText muted>{active.data.title}</AppText>
              </View>
              <Play color={theme.colors.warning} size={24} />
            </View>
          </Card>
        ) : null}

        <Card style={styles.featureCard}>
          <View style={styles.spaceBetween}>
            <AppText variant="section">Suggested next</AppText>
            <Dumbbell size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.suggestedRow}>
            <View style={[styles.suggestedIcon, { borderColor: theme.colors.primary }]}>
              <Dumbbell size={24} color={theme.colors.primary} />
            </View>
            <View>
              <AppText weight="800" style={styles.suggestedTitle}>
                {suggestedRoutine?.name ?? 'Empty workout'}
              </AppText>
              <AppText muted>
                {suggestedRoutine ? `${suggestedRoutine.exercises.length} exercises • ~${Math.max(35, suggestedRoutine.exercises.length * 10)} min` : 'Build from scratch'}
              </AppText>
            </View>
          </View>
          <Button
            label={suggestedRoutine ? 'Start workout' : 'Start empty workout'}
            icon={Play}
            onPress={() => (suggestedRoutine ? startRoutine.mutate(suggestedRoutine.id) : startEmpty.mutate())}
          />
        </Card>

        <Card>
          <View style={styles.spaceBetween}>
            <AppText variant="section">This week</AppText>
            <View style={styles.weekLabel}>
              <AppText muted>{weekLabel}</AppText>
              <Calendar size={17} color={theme.colors.muted} />
            </View>
          </View>
          <View style={styles.weekRow}>
            {firstFive.map((day, index) => {
              const StatusIcon = day.icon;
              const color = day.tone === 'good' ? theme.colors.primary : theme.colors.muted;
              return (
                <View key={day.day} style={[styles.weekCell, index > 0 && { borderLeftColor: theme.colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}>
                  <AppText variant="small" muted>
                    {day.day.toUpperCase()}
                  </AppText>
                  <AppText weight="700">{day.title}</AppText>
                  <View style={[styles.weekStatusIcon, { borderColor: color }]}>
                    <StatusIcon size={16} color={color} />
                  </View>
                  <AppText weight="700" style={{ color }}>
                    {day.status}
                  </AppText>
                </View>
              );
            })}
          </View>
        </Card>

        <AppText variant="section">Saved routines</AppText>
        {renderSavedRoutines()}
      </>
    );
  };

  const renderProgramTab = () => (
    <>
      <Card>
        <AppText variant="section">Weekly schedule</AppText>
        <View style={styles.programRow}>
          {PROGRAM_WEEK.map((day, index) => {
            const iconColor = day.type === 'rest' ? theme.colors.muted : theme.colors.primary;
            const Icon = day.type === 'rest' ? Minus : Dumbbell;
            return (
              <View
                key={day.day}
                style={[styles.programCell, index > 0 && { borderLeftColor: theme.colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}
              >
                <AppText muted variant="small" numberOfLines={1}>
                  {day.day}
                </AppText>
                <Icon size={18} color={iconColor} />
                <AppText
                  weight="700"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={styles.programTitle}
                >
                  {day.title}
                </AppText>
              </View>
            );
          })}
        </View>
        <Button label="Edit program" icon={Pencil} variant="secondary" onPress={() => Alert.alert('Program', 'Program editing can be opened from this action.')} />
      </Card>

      <View style={styles.spaceBetween}>
        <AppText variant="section">Saved routines</AppText>
        <Button label="New template" icon={Plus} variant="secondary" onPress={() => Alert.alert('Templates', 'Template creator can be opened from this action.')} />
      </View>
      {renderSavedRoutines()}
    </>
  );

  const renderHistoryTab = () => (
    <>
      <Card>
        <View style={styles.spaceBetween}>
          <AppText variant="section">This week</AppText>
          <Calendar size={20} color={theme.colors.primary} />
        </View>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCell}>
            <Dumbbell size={24} color={theme.colors.primary} />
            <AppText style={[styles.summaryMetric, { color: theme.colors.primary }]}>{workoutsThisWeek.length}</AppText>
            <AppText muted>Workouts</AppText>
          </View>
          <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
          <View style={styles.summaryCell}>
            <Clock size={24} color={theme.colors.primary} />
            <AppText style={[styles.summaryMetric, { color: theme.colors.primary }]}>{weekMinutes}</AppText>
            <AppText muted>Minutes</AppText>
          </View>
        </View>
      </Card>

      <View style={styles.sectionTitle}>
        <AppText variant="section">Recent history</AppText>
        <History color={theme.colors.muted} size={18} />
      </View>
      {recentList.length ? (
        recentList.map((workout) => (
          <Card key={workout.id} onPress={() => navigation.navigate('WorkoutSummary', { sessionId: workout.id })} style={styles.listCard}>
            <View style={styles.historyRow}>
              <View style={[styles.historyIcon, { backgroundColor: theme.colors.surfaceAlt }]}>
                <Dumbbell size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.historyCopy}>
                <AppText weight="800" style={styles.savedTitle}>
                  {workout.title}
                </AppText>
                <AppText muted>
                  {format(new Date(workout.startedAt), 'd/M/yyyy')} • {workout.exercises.length} exercises
                </AppText>
              </View>
              <View style={styles.historyMeta}>
                <AppText muted>{durationMinutes(workout)} min</AppText>
                <Clock size={18} color={theme.colors.muted} />
              </View>
            </View>
          </Card>
        ))
      ) : (
        <EmptyState icon={History} title="No workouts logged" body="Completed sessions will appear here with volume, duration, and PR context." />
      )}
    </>
  );

  const renderExercisesTab = () => (
    <>
      <View style={styles.searchRow}>
        <View style={[styles.searchInputWrap, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Search size={20} color={theme.colors.muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search exercises..."
            placeholderTextColor={theme.colors.muted}
            style={[styles.searchInput, { color: theme.colors.text }]}
          />
        </View>
        <Pressable
          onPress={() => Alert.alert('Filters', 'Advanced filters can be added here.')}
          style={({ pressed }) => [
            styles.filterButton,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
          ]}
        >
          <SlidersHorizontal size={20} color={theme.colors.muted} />
        </Pressable>
      </View>

      <View style={styles.chipsRow}>
        {EXERCISE_FILTERS.map((chip) => {
          const activeChip = chip === exerciseFilter;
          return (
            <Pressable
              key={chip}
              onPress={() => setExerciseFilter(chip)}
              style={({ pressed }) => [
                styles.chip,
                {
                  borderColor: activeChip ? theme.colors.primary : theme.colors.border,
                  backgroundColor: activeChip ? theme.colors.surfaceAlt : 'transparent',
                  opacity: pressed ? 0.84 : 1,
                },
              ]}
            >
              <AppText weight={activeChip ? '800' : '600'} style={{ color: activeChip ? theme.colors.primary : theme.colors.muted }}>
                {chip}
              </AppText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.spaceBetween}>
        <AppText variant="section">Exercise library</AppText>
        <Pressable onPress={() => Alert.alert('Exercise library', 'Add exercise can open a creation flow.')}>
          <AppText weight="800" style={{ color: theme.colors.primary }}>
            Add exercise  +
          </AppText>
        </Pressable>
      </View>

      {filteredExercises.length ? (
        filteredExercises.map((exercise) => {
          const stats = exerciseStats.get(exercise.id);
          const category = mapExerciseCategory(exercise.primaryMuscle);
          const type = exercise.equipment.toLowerCase() === 'bodyweight' ? 'Bodyweight' : 'Compound';
          const prLabel = stats?.prWeightKg != null ? `${Math.round(stats.prWeightKg)} kg` : '--';
          const latestLabel =
            stats?.latestWeightKg != null
              ? `Last ${Math.round(stats.latestWeightKg)} kg x ${stats.latestReps ?? '-'}`
              : stats?.latestReps != null
                ? `Last ${stats.latestReps} reps`
                : 'Last --';
          return (
            <Card key={exercise.id} onPress={() => navigation.navigate('ExerciseHistory', { exerciseId: exercise.id })} style={styles.listCard}>
              <View style={styles.exerciseRow}>
                <View style={[styles.exerciseIcon, { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border }]}>
                  <Dumbbell size={22} color={theme.colors.primary} />
                </View>
                <View style={styles.exerciseMain}>
                  <AppText weight="800" style={styles.savedTitle}>
                    {exercise.name}
                  </AppText>
                  <AppText muted>
                    {category} • {type}
                  </AppText>
                  <AppText muted>{exercise.equipment}</AppText>
                </View>
                <View style={styles.exerciseStats}>
                  <AppText muted>
                    PR <AppText weight="800" style={{ color: theme.colors.primary }}>{prLabel}</AppText>
                  </AppText>
                  <AppText muted>{latestLabel}</AppText>
                  <AppText muted>{stats?.latestDate ?? '--'}</AppText>
                </View>
                <View style={styles.exerciseActions}>
                  <Star size={20} color={theme.colors.primary} />
                  <ChevronRight size={22} color={theme.colors.muted} />
                </View>
              </View>
            </Card>
          );
        })
      ) : (
        <EmptyState icon={Search} title="No exercises found" body="Adjust search or category filters." />
      )}

      <AppText muted style={styles.exerciseCount}>
        {filteredExercises.length} exercises
      </AppText>
    </>
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <AppText variant="title">Workouts</AppText>
          <AppText muted>Templates, history, and active logging.</AppText>
        </View>
        <Button label="Empty" icon={Plus} variant="secondary" onPress={() => startEmpty.mutate()} />
      </View>

      {renderTabs()}

      {tab === 'today' ? renderTodayTab() : null}
      {tab === 'program' ? renderProgramTab() : null}
      {tab === 'history' ? renderHistoryTab() : null}
      {tab === 'exercises' ? renderExercisesTab() : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tabsRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    marginHorizontal: -2,
  },
  tabItem: {
    alignItems: 'center',
    borderBottomWidth: 3,
    flex: 1,
    minHeight: 50,
    justifyContent: 'center',
  },
  spaceBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  featureCard: {
    gap: 10,
  },
  suggestedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  suggestedIcon: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  suggestedTitle: {
    fontSize: 16,
  },
  weekLabel: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  weekRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  weekCell: {
    alignItems: 'center',
    flex: 1,
    gap: 6,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  weekStatusIcon: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  programRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    justifyContent: 'space-between',
  },
  programCell: {
    alignItems: 'center',
    borderRadius: 8,
    flex: 1,
    gap: 3,
    minWidth: 0,
    paddingHorizontal: 3,
    paddingVertical: 4,
  },
  programTitle: {
    fontSize: 12,
  },
  listCard: {
    gap: 0,
  },
  savedRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  savedIcon: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  savedCopy: {
    flex: 1,
    gap: 1,
  },
  savedTitle: {
    fontSize: 15,
  },
  setBadge: {
    borderRadius: 8,
    gap: 2,
    minWidth: 60,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryCell: {
    alignItems: 'center',
    flex: 1,
    gap: 2,
    paddingVertical: 8,
  },
  summaryMetric: {
    fontSize: 34,
    lineHeight: 38,
  },
  summaryDivider: {
    height: '74%',
    width: StyleSheet.hairlineWidth,
  },
  historyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  historyIcon: {
    alignItems: 'center',
    borderRadius: 23,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  historyCopy: {
    flex: 1,
    gap: 2,
  },
  historyMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  searchRow: {
    flexDirection: 'row',
    gap: 8,
  },
  searchInputWrap: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    paddingVertical: 6,
  },
  filterButton: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 14,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  exerciseRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  exerciseIcon: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  exerciseMain: {
    flex: 1,
    gap: 1,
  },
  exerciseStats: {
    gap: 1,
    minWidth: 102,
  },
  exerciseActions: {
    alignItems: 'center',
    gap: 8,
  },
  exerciseCount: {
    alignSelf: 'center',
    marginBottom: 6,
  },
});
