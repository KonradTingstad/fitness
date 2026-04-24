import { useNavigation } from '@react-navigation/native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, endOfWeek, format, startOfWeek } from 'date-fns';
import {
  Calendar,
  Check,
  ChevronRight,
  Circle,
  Clock,
  Dumbbell,
  Flame,
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
import { WorkoutPlanItem, startEmptyWorkout, startWorkoutFromRoutine } from '@/data/repositories/workoutRepository';
import { useExercises, useRecentWorkouts, useRoutines, useWorkoutPlansForRange, useWorkoutSessionsForRange } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type WorkoutTab = 'today' | 'program' | 'history' | 'exercises';
type ExerciseFilter = 'All' | 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms';
type ScheduleType = 'workout' | 'rest';
type ScheduleSource = 'plan' | 'program';
type AdherenceStatus = 'done' | 'rest' | 'missed' | 'pending' | 'upcoming';

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
  { day: 'Sat', title: 'Cardio', type: 'workout' },
  { day: 'Sun', title: 'Recovery', type: 'rest' },
];

interface ProgramDay {
  date: Date;
  localDate: string;
  day: string;
  title: string;
  type: ScheduleType;
  source: ScheduleSource;
  routineId?: string;
  exerciseCount: number;
  estimatedDurationMinutes: number;
  scheduledTime?: string | null;
}

interface Adherence {
  status: AdherenceStatus;
  label: string;
  followed: boolean;
  tone: 'good' | 'muted' | 'bad';
}

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

function localDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function templateForDate(date: Date) {
  const index = (date.getDay() + 6) % 7;
  return PROGRAM_WEEK[index];
}

function findRoutineForTemplate(templateTitle: string, routines: Routine[]): Routine | undefined {
  const title = templateTitle.toLowerCase();
  return routines.find((routine) => {
    const routineName = routine.name.toLowerCase();
    return routineName === title || routineName.includes(title) || title.includes(routineName);
  });
}

function buildProgramDay(date: Date, planMap: Map<string, WorkoutPlanItem>, routines: Routine[]): ProgramDay {
  const localDate = localDateKey(date);
  const plan = planMap.get(localDate);
  if (plan) {
    return {
      date,
      localDate,
      day: format(date, 'EEE'),
      title: plan.workoutName,
      type: 'workout',
      source: 'plan',
      routineId: plan.routineId,
      exerciseCount: plan.exerciseCount,
      estimatedDurationMinutes: plan.estimatedDurationMinutes,
      scheduledTime: plan.scheduledTime,
    };
  }

  const template = templateForDate(date);
  const routine = template.type === 'workout' ? findRoutineForTemplate(template.title, routines) : undefined;
  return {
    date,
    localDate,
    day: template.day,
    title: template.title,
    type: template.type,
    source: 'program',
    routineId: routine?.id,
    exerciseCount: routine?.exercises.length ?? 0,
    estimatedDurationMinutes: routine ? Math.max(35, routine.exercises.length * 10) : 40,
  };
}

function sessionsByLocalDate(sessions: WorkoutSession[]): Map<string, WorkoutSession[]> {
  const grouped = new Map<string, WorkoutSession[]>();
  for (const session of sessions) {
    const key = session.startedAt.slice(0, 10);
    grouped.set(key, [...(grouped.get(key) ?? []), session]);
  }
  return grouped;
}

function workoutMatchesProgramDay(session: WorkoutSession, day: ProgramDay): boolean {
  if (day.routineId) {
    return session.routineId === day.routineId;
  }
  return true;
}

function getAdherence(day: ProgramDay, sessions: WorkoutSession[], todayKey: string): Adherence {
  if (day.localDate > todayKey) {
    return { status: 'upcoming', label: 'Upcoming', followed: false, tone: 'muted' };
  }

  const loggedSessions = sessions.filter((session) => session.status === 'active' || session.status === 'completed');
  if (day.type === 'rest') {
    if (loggedSessions.length > 0) {
      return { status: 'missed', label: 'Missed', followed: false, tone: 'bad' };
    }
    return { status: 'rest', label: 'Rest', followed: true, tone: 'muted' };
  }

  const completedPlan = loggedSessions.some((session) => session.status === 'completed' && workoutMatchesProgramDay(session, day));
  if (completedPlan) {
    return { status: 'done', label: 'Done', followed: true, tone: 'good' };
  }
  if (day.localDate === todayKey) {
    return { status: 'pending', label: 'Today', followed: false, tone: 'good' };
  }
  return { status: 'missed', label: 'Missed', followed: false, tone: 'bad' };
}

function calculateCurrentStreak(daysNewestFirst: ProgramDay[], groupedSessions: Map<string, WorkoutSession[]>, todayKey: string): number {
  let streak = 0;
  for (const day of daysNewestFirst) {
    const adherence = getAdherence(day, groupedSessions.get(day.localDate) ?? [], todayKey);
    if (adherence.status === 'pending' || adherence.status === 'upcoming') {
      continue;
    }
    if (!adherence.followed) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function scheduleTitleForCell(title: string): string {
  return title.replace(/\s+Strength$/i, '');
}

export function WorkoutDashboardScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<WorkoutTab>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseFilter>('All');
  const today = new Date();
  const todayKey = localDateKey(today);
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const streakStart = addDays(today, -35);
  const planRangeStart = localDateKey(streakStart);
  const planRangeEnd = localDateKey(weekEnd);
  const weekLabel = `Week of ${format(weekStart, 'd MMM')}`;

  const routines = useRoutines();
  const recent = useRecentWorkouts();
  const workoutPlans = useWorkoutPlansForRange(planRangeStart, planRangeEnd);
  const workoutSessions = useWorkoutSessionsForRange(planRangeStart, planRangeEnd);
  const exercises = useExercises();

  const startRoutine = useMutation({
    mutationFn: (routineId: string) => startWorkoutFromRoutine(routineId),
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentWorkouts });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
      navigation.navigate('LiveWorkout', { sessionId });
    },
  });

  const startEmpty = useMutation({
    mutationFn: () => startEmptyWorkout(),
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
      navigation.navigate('LiveWorkout', { sessionId });
    },
  });

  if (routines.isLoading || recent.isLoading || workoutPlans.isLoading || workoutSessions.isLoading || exercises.isLoading) {
    return <LoadingState label="Loading workouts" />;
  }

  const routineList = routines.data ?? [];
  const recentList = recent.data ?? [];
  const planList = workoutPlans.data ?? [];
  const sessionRange = workoutSessions.data ?? [];
  const exerciseList = exercises.data ?? [];
  const suggestedRoutine = routineList[0];
  const planMap = new Map(planList.map((plan) => [plan.localDate, plan]));
  const groupedSessions = sessionsByLocalDate(sessionRange);
  const weekProgramDays = Array.from({ length: 7 }, (_, index) => buildProgramDay(addDays(weekStart, index), planMap, routineList));
  const todayProgramDay = buildProgramDay(today, planMap, routineList);
  const streakHistoryDays = Array.from({ length: 36 }, (_, index) => buildProgramDay(addDays(today, -index), planMap, routineList));
  const streakCount = calculateCurrentStreak(streakHistoryDays, groupedSessions, todayKey);

  const workoutsThisWeek = sessionRange.filter((workout) => {
    const startedAt = new Date(workout.startedAt);
    return workout.status === 'completed' && startedAt >= weekStart && startedAt <= weekEnd;
  });
  const weekMinutes = workoutsThisWeek.reduce((sum, workout) => sum + durationMinutes(workout), 0);
  const completedSetsThisWeek = workoutsThisWeek.flatMap((workout) =>
    workout.exercises.flatMap((exercise) => exercise.sets.filter((set) => set.isCompleted)),
  );
  const weekVolume = completedSetsThisWeek.reduce((sum, set) => sum + (set.weightKg ?? 0) * (set.reps ?? 0), 0);

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
    const todaySessions = groupedSessions.get(todayKey) ?? [];
    const activeToday = todaySessions.find(
      (session) => session.status === 'active' && (todayProgramDay.type === 'rest' || workoutMatchesProgramDay(session, todayProgramDay)),
    );
    const isRestToday = todayProgramDay.type === 'rest';
    const isPlannedToday = todayProgramDay.source === 'plan';
    const topRoutine = isPlannedToday
      ? routineList.find((routine) => routine.id === todayProgramDay.routineId)
      : suggestedRoutine;
    const topTitle = isPlannedToday ? "Today's workout" : 'Suggested workout';
    const workoutTitle = isPlannedToday ? todayProgramDay.title : topRoutine?.name ?? 'Empty workout';
    const workoutExerciseCount = isPlannedToday ? todayProgramDay.exerciseCount : topRoutine?.exercises.length ?? 0;
    const workoutDuration = isPlannedToday
      ? todayProgramDay.estimatedDurationMinutes
      : topRoutine
        ? Math.max(35, topRoutine.exercises.length * 10)
        : 30;

    const firstFive = weekProgramDays.slice(0, 5).map((day) => ({
      day,
      adherence: getAdherence(day, groupedSessions.get(day.localDate) ?? [], todayKey),
    }));
    const streakVisualDays = weekProgramDays.map((day) => ({
      day,
      adherence: getAdherence(day, groupedSessions.get(day.localDate) ?? [], todayKey),
    }));

    return (
      <>
        <Card style={styles.featureCard}>
          <View style={styles.spaceBetween}>
            <AppText variant="section" style={{ color: theme.colors.primary }}>
              {isRestToday ? "Today's workout" : topTitle}
            </AppText>
            <Dumbbell size={20} color={theme.colors.primary} />
          </View>
          <View style={styles.suggestedRow}>
            <View style={[styles.suggestedIcon, { borderColor: theme.colors.primary }]}>
              {isRestToday ? <Minus size={24} color={theme.colors.primary} /> : <Dumbbell size={24} color={theme.colors.primary} />}
            </View>
            <View>
              <AppText weight="800" style={styles.suggestedTitle}>
                {isRestToday ? 'Rest day' : workoutTitle}
              </AppText>
              <AppText muted>
                {isRestToday ? 'No workout planned today' : `${workoutExerciseCount} exercises • ~${workoutDuration} min`}
              </AppText>
            </View>
          </View>
          {!isRestToday ? (
            <Button
              label={activeToday ? 'View workout' : 'Start workout'}
              icon={Play}
              onPress={() => {
                if (activeToday) {
                  navigation.navigate('LiveWorkout', { sessionId: activeToday.id });
                  return;
                }
                if (isPlannedToday && todayProgramDay.routineId) {
                  startRoutine.mutate(todayProgramDay.routineId);
                  return;
                }
                if (topRoutine) {
                  startRoutine.mutate(topRoutine.id);
                  return;
                }
                startEmpty.mutate();
              }}
            />
          ) : null}
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
            {firstFive.map(({ day, adherence }, index) => {
              const StatusIcon = adherence.status === 'done' ? Check : adherence.status === 'rest' || adherence.status === 'missed' ? Minus : Circle;
              const color =
                adherence.tone === 'good' ? theme.colors.primary : adherence.tone === 'bad' ? theme.colors.danger : theme.colors.muted;
              return (
                <View key={day.localDate} style={[styles.weekCell, index > 0 && { borderLeftColor: theme.colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}>
                  <AppText variant="small" muted>
                    {day.day.toUpperCase()}
                  </AppText>
                  <AppText weight="700" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.74} style={styles.weekTitle}>
                    {scheduleTitleForCell(day.title)}
                  </AppText>
                  <View style={[styles.weekStatusIcon, { borderColor: color }]}>
                    <StatusIcon size={16} color={color} />
                  </View>
                  <AppText weight="700" style={{ color }}>
                    {adherence.label}
                  </AppText>
                </View>
              );
            })}
          </View>
        </Card>

        <Card style={styles.streakCard}>
          <View style={styles.streakHeader}>
            <AppText variant="section">Streak</AppText>
          </View>
          <View style={styles.streakBody}>
            <View style={styles.streakScore}>
              <Flame size={29} color={theme.colors.warning} fill={theme.colors.warning} />
              <AppText style={styles.streakCount} weight="800">{streakCount}</AppText>
              <AppText muted>days</AppText>
            </View>
            <View style={[styles.streakDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.streakDots}>
              {streakVisualDays.map(({ day, adherence }) => {
                const dotColor = adherence.followed
                  ? theme.colors.primary
                  : adherence.status === 'missed'
                    ? theme.colors.danger
                    : theme.colors.surfaceAlt;
                return (
                  <View key={day.localDate} style={styles.streakDotCell}>
                    <AppText muted variant="small">{day.day.slice(0, 1)}</AppText>
                    <View style={[styles.streakDot, { backgroundColor: dotColor }]} />
                  </View>
                );
              })}
            </View>
          </View>
          <AppText muted>{streakCount > 0 ? 'Keep it going!' : 'Follow the next planned day to start a streak.'}</AppText>
        </Card>

        <Card>
          <View style={styles.spaceBetween}>
            <AppText variant="section">Progress overview</AppText>
            <AppText muted>This week</AppText>
          </View>
          <View style={styles.progressOverviewRow}>
            <View style={styles.progressOverviewCell}>
              <AppText muted>Workouts</AppText>
              <AppText style={styles.progressOverviewValue}>{workoutsThisWeek.length}</AppText>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.progressOverviewCell}>
              <AppText muted>Sets</AppText>
              <AppText style={styles.progressOverviewValue}>{completedSetsThisWeek.length}</AppText>
            </View>
            <View style={[styles.summaryDivider, { backgroundColor: theme.colors.border }]} />
            <View style={styles.progressOverviewCell}>
              <AppText muted>Volume (kg)</AppText>
              <AppText style={styles.progressOverviewValue}>{Math.round(weekVolume).toLocaleString()}</AppText>
            </View>
          </View>
        </Card>
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
  weekTitle: {
    maxWidth: 56,
  },
  weekStatusIcon: {
    alignItems: 'center',
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  streakCard: {
    gap: 8,
  },
  streakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streakBody: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  streakScore: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 112,
  },
  streakCount: {
    fontSize: 24,
    lineHeight: 28,
  },
  streakDivider: {
    height: 52,
    width: StyleSheet.hairlineWidth,
  },
  streakDots: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  streakDotCell: {
    alignItems: 'center',
    gap: 8,
  },
  streakDot: {
    borderRadius: 999,
    height: 12,
    width: 12,
  },
  progressOverviewRow: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  progressOverviewCell: {
    flex: 1,
    gap: 8,
    paddingVertical: 6,
  },
  progressOverviewValue: {
    fontSize: 18,
    fontWeight: '800',
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
