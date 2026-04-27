import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { addDays, addMonths, addYears, endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns';
import {
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Circle,
  Clock,
  Dumbbell,
  EllipsisVertical,
  Flag,
  Flame,
  Heart,
  History,
  Minus,
  Pencil,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Star,
} from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Alert, LayoutAnimation, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { LoadingState } from '@/components/LoadingState';
import { Screen } from '@/components/Screen';
import { Exercise, Routine, WorkoutSession } from '@/domain/models';
import { ProgramScheduleDay, WorkoutPlanItem, listWorkoutSessionsForRange, startEmptyWorkout, startWorkoutFromRoutine } from '@/data/repositories/workoutRepository';
import { useExercises, useProgramScheduleForRange, useRecentWorkouts, useRoutines, useWorkoutPlansForRange, useWorkoutSessionsForRange } from '@/hooks/useAppQueries';
import { queryKeys } from '@/hooks/queryKeys';
import { RootStackParamList } from '@/navigation/types';
import { useLiveWorkoutOverlayStore } from '@/features/workouts/stores/liveWorkoutOverlayStore';
import { useAppTheme } from '@/theme/theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type WorkoutTab = 'today' | 'program' | 'history' | 'exercises';
type ExerciseFilter = 'All' | 'Chest' | 'Back' | 'Legs' | 'Shoulders' | 'Arms';
type ScheduleType = 'workout' | 'rest';
type ScheduleSource = 'plan' | 'program';
type AdherenceStatus = 'done' | 'rest' | 'missed' | 'pending' | 'upcoming';
type HistoryCalendarMode = 'month' | 'year' | 'multiYear';

const WORKOUT_GROUP_STORAGE_KEY = 'fitness.workoutGroups.v1';

const WORKOUT_TABS: Array<{ key: WorkoutTab; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: 'program', label: 'Program' },
  { key: 'history', label: 'History' },
  { key: 'exercises', label: 'Exercises' },
];

const EXERCISE_FILTERS: ExerciseFilter[] = ['All', 'Chest', 'Back', 'Legs', 'Shoulders', 'Arms'];
const HISTORY_WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HISTORY_MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HISTORY_CALENDAR_MODES: Array<{ key: HistoryCalendarMode; label: string }> = [
  { key: 'month', label: 'Month' },
  { key: 'year', label: 'Year' },
  { key: 'multiYear', label: 'Multi-year' },
];
const HISTORY_YEAR_MONTH_COUNT = 24;
const HISTORY_MULTI_YEAR_COUNT = 5;
const HISTORY_CALENDAR_STALE_TIME_MS = 5 * 60 * 1000;

const PROGRAM_WEEK: Array<{ day: string; title: string; type: ScheduleType }> = [
  { day: 'Mon', title: 'Upper', type: 'workout' },
  { day: 'Tue', title: 'Rest', type: 'rest' },
  { day: 'Wed', title: 'Lower', type: 'workout' },
  { day: 'Thu', title: 'Pull', type: 'workout' },
  { day: 'Fri', title: 'Rest', type: 'rest' },
  { day: 'Sat', title: 'Cardio', type: 'workout' },
  { day: 'Sun', title: 'Recovery', type: 'rest' },
];

const EMPTY_ROUTINES: Routine[] = [];

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

interface WorkoutGroup {
  id: string;
  name: string;
  routineIds: string[];
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

function createGroupId(name = 'group'): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `group-${slug || 'custom'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function stableGroupId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return `group-${slug || 'templates'}`;
}

function defaultGroupNameForRoutine(routine: Routine): string {
  const name = routine.name.toLowerCase();
  if (name.includes('push') || name.includes('pull') || name.includes('legs') || name.includes('ppl')) {
    return 'Push Pull Legs';
  }
  if (name.includes('upper') || name.includes('lower')) {
    return 'Upper / Lower';
  }
  if (name.includes('full') || name.includes('body') || name.includes('total')) {
    return 'Full Body';
  }
  return 'Saved templates';
}

function buildDefaultGroups(routines: Routine[]): WorkoutGroup[] {
  const groups = new Map<string, WorkoutGroup>();

  for (const routine of routines) {
    const groupName = defaultGroupNameForRoutine(routine);
    const existing = groups.get(groupName) ?? { id: stableGroupId(groupName), name: groupName, routineIds: [] };
    existing.routineIds.push(routine.id);
    groups.set(groupName, existing);
  }

  return Array.from(groups.values());
}

function parseStoredGroups(value: string | null): WorkoutGroup[] | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    return parsed
      .filter((item): item is WorkoutGroup => typeof item?.id === 'string' && typeof item?.name === 'string' && Array.isArray(item?.routineIds))
      .map((item) => ({
        id: item.id,
        name: item.name,
        routineIds: item.routineIds.filter((id): id is string => typeof id === 'string'),
      }));
  } catch {
    return null;
  }
}

function hydrateWorkoutGroups(storedGroups: WorkoutGroup[] | null, routines: Routine[]): WorkoutGroup[] {
  if (!storedGroups?.length) {
    return buildDefaultGroups(routines);
  }

  const routineIds = new Set(routines.map((routine) => routine.id));
  const assignedRoutineIds = new Set<string>();
  const groups = storedGroups.map((group) => {
    const nextRoutineIds = group.routineIds.filter((routineId) => {
      if (!routineIds.has(routineId) || assignedRoutineIds.has(routineId)) {
        return false;
      }
      assignedRoutineIds.add(routineId);
      return true;
    });
    return { ...group, routineIds: nextRoutineIds };
  });

  for (const routine of routines) {
    if (assignedRoutineIds.has(routine.id)) {
      continue;
    }
    const groupName = defaultGroupNameForRoutine(routine);
    const existingGroup = groups.find((group) => group.name === groupName);
    if (existingGroup) {
      existingGroup.routineIds.push(routine.id);
    } else {
      groups.push({ id: stableGroupId(groupName), name: groupName, routineIds: [routine.id] });
    }
  }

  return groups;
}

function formatMuscleGroup(value: string): string {
  return value
    .split(/\s+/)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(' ');
}

function routineMuscleGroups(routine: Routine): string {
  const groups = Array.from(
    new Set(
      routine.exercises
        .map((item) => item.exercise?.primaryMuscle)
        .filter((muscle): muscle is string => Boolean(muscle))
        .map(formatMuscleGroup),
    ),
  );
  return groups.slice(0, 3).join(' • ') || routinePreview(routine) || 'Template';
}

function templateCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'template' : 'templates'}`;
}

function localDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

function monthTimestamp(date: Date): number {
  return startOfMonth(date).getTime();
}

function isFutureMonth(date: Date, maxDate: Date): boolean {
  return monthTimestamp(date) > monthTimestamp(maxDate);
}

function clampToLatestMonth(date: Date, maxDate: Date): Date {
  return isFutureMonth(date, maxDate) ? startOfMonth(maxDate) : date;
}

function getHistoryCalendarRange(anchorDate: Date, mode: HistoryCalendarMode): { startLocalDate: string; endLocalDate: string } {
  if (mode === 'month') {
    return {
      startLocalDate: localDateKey(startOfMonth(anchorDate)),
      endLocalDate: localDateKey(endOfMonth(anchorDate)),
    };
  }

  const anchorYear = anchorDate.getFullYear();
  if (mode === 'year') {
    const months = buildHistoryYearMonths(anchorDate);
    const firstMonth = months[0] ?? anchorDate;
    const lastMonth = months[months.length - 1] ?? anchorDate;
    return {
      startLocalDate: localDateKey(startOfMonth(firstMonth)),
      endLocalDate: localDateKey(endOfMonth(lastMonth)),
    };
  }

  const startYear = mode === 'multiYear' ? anchorYear - HISTORY_MULTI_YEAR_COUNT + 1 : anchorYear;
  return {
    startLocalDate: localDateKey(new Date(startYear, 0, 1)),
    endLocalDate: localDateKey(new Date(anchorYear, 11, 31)),
  };
}

function buildHistoryYearMonths(anchorDate: Date): Date[] {
  const anchorMonthIndex = anchorDate.getMonth();
  const rowEndMonthIndex = Math.min(11, Math.floor(anchorMonthIndex / 3) * 3 + 2);
  const rowEndMonth = new Date(anchorDate.getFullYear(), rowEndMonthIndex, 1);
  const firstMonth = addMonths(rowEndMonth, -(HISTORY_YEAR_MONTH_COUNT - 1));
  return Array.from({ length: HISTORY_YEAR_MONTH_COUNT }, (_, index) => addMonths(firstMonth, index));
}

function buildMonthCalendarDays(month: Date): Array<Date | null> {
  const firstDay = startOfMonth(month);
  const lastDay = endOfMonth(month);
  const leadingEmptyDays = (firstDay.getDay() + 6) % 7;
  const days: Array<Date | null> = Array.from({ length: leadingEmptyDays }, () => null);

  for (let day = 0; day < lastDay.getDate(); day += 1) {
    days.push(addDays(firstDay, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function buildYearHeatmapWeeks(year: number): Array<Array<Date | null>> {
  const start = startOfWeek(new Date(year, 0, 1), { weekStartsOn: 1 });
  const end = endOfWeek(new Date(year, 11, 31), { weekStartsOn: 1 });
  const weeks: Array<Array<Date | null>> = [];
  let cursor = start;

  while (cursor <= end) {
    const week: Array<Date | null> = [];
    for (let day = 0; day < 7; day += 1) {
      week.push(cursor.getFullYear() === year ? cursor : null);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function latestCompletedWorkoutByLocalDate(sessions: WorkoutSession[]): Map<string, WorkoutSession> {
  const workoutsByDate = new Map<string, WorkoutSession>();
  for (const session of sessions) {
    if (session.status !== 'completed') {
      continue;
    }
    const key = session.startedAt.slice(0, 10);
    if (!workoutsByDate.has(key)) {
      workoutsByDate.set(key, session);
    }
  }
  return workoutsByDate;
}

function completedWorkoutCountByLocalDate(sessions: WorkoutSession[]): Map<string, number> {
  const countsByDate = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== 'completed') {
      continue;
    }
    const key = session.startedAt.slice(0, 10);
    countsByDate.set(key, (countsByDate.get(key) ?? 0) + 1);
  }
  return countsByDate;
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

function iconForProgramDay(day: ProgramScheduleDay) {
  if (day.activityType === 'rest') return Minus;
  if (day.activityType === 'cardio') return Heart;
  if (day.activityType === 'padel') return Circle;
  if (day.activityType === 'golf') return Flag;
  if (day.activityType === 'recovery') return Circle;
  return Dumbbell;
}

export function WorkoutDashboardScreen() {
  const theme = useAppTheme();
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const openLiveWorkout = useLiveWorkoutOverlayStore((state) => state.open);
  const historyYearScrollRef = useRef<ScrollView>(null);
  const historyMultiYearScrollRef = useRef<ScrollView>(null);
  const [tab, setTab] = useState<WorkoutTab>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState<ExerciseFilter>('All');
  const [workoutGroups, setWorkoutGroups] = useState<WorkoutGroup[]>([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(() => new Set());
  const [historyMonth, setHistoryMonth] = useState(() => new Date());
  const [historyCalendarMode, setHistoryCalendarMode] = useState<HistoryCalendarMode>('month');
  const today = new Date();
  const todayKey = localDateKey(today);
  const todayMonthKey = localDateKey(startOfMonth(today));
  const weekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
  const streakStart = addDays(today, -35);
  const planRangeStart = localDateKey(streakStart);
  const planRangeEnd = localDateKey(weekEnd);
  const historyCalendarAnchor = historyCalendarMode === 'month' ? historyMonth : today;
  const historyYear = historyCalendarAnchor.getFullYear();
  const historyCalendarRange = getHistoryCalendarRange(historyCalendarAnchor, historyCalendarMode);
  const canGoToNextHistoryMonth = monthTimestamp(historyMonth) < monthTimestamp(today);
  const weekLabel = `Week of ${format(weekStart, 'd MMM')}`;

  const routines = useRoutines();
  const recent = useRecentWorkouts();
  const workoutPlans = useWorkoutPlansForRange(planRangeStart, planRangeEnd);
  const programSchedule = useProgramScheduleForRange(localDateKey(weekStart), localDateKey(weekEnd));
  const workoutSessions = useWorkoutSessionsForRange(planRangeStart, planRangeEnd);
  const historyCalendarSessions = useWorkoutSessionsForRange(historyCalendarRange.startLocalDate, historyCalendarRange.endLocalDate);
  const exercises = useExercises();
  const routineList = routines.data ?? EMPTY_ROUTINES;

  useEffect(() => {
    if (routines.isLoading) {
      return;
    }

    let cancelled = false;

    async function loadGroups() {
      const storedValue = await AsyncStorage.getItem(WORKOUT_GROUP_STORAGE_KEY);
      if (cancelled) {
        return;
      }
      const hydratedGroups = hydrateWorkoutGroups(parseStoredGroups(storedValue), routineList);
      setWorkoutGroups(hydratedGroups);
      setExpandedGroupIds((current) => {
        if (current.size > 0) {
          return current;
        }
        return new Set(hydratedGroups.slice(0, 1).map((group) => group.id));
      });
      setGroupsLoaded(true);
    }

    loadGroups().catch(() => {
      if (cancelled) {
        return;
      }
      const fallbackGroups = buildDefaultGroups(routineList);
      setWorkoutGroups(fallbackGroups);
      setExpandedGroupIds((current) => (current.size > 0 ? current : new Set(fallbackGroups.slice(0, 1).map((group) => group.id))));
      setGroupsLoaded(true);
    });

    return () => {
      cancelled = true;
    };
  }, [routineList, routines.isLoading]);

  useEffect(() => {
    if (!groupsLoaded) {
      return;
    }
    AsyncStorage.setItem(WORKOUT_GROUP_STORAGE_KEY, JSON.stringify(workoutGroups)).catch(() => undefined);
  }, [groupsLoaded, workoutGroups]);

  useEffect(() => {
    setHistoryMonth((current) => clampToLatestMonth(current, today));
  }, [todayMonthKey]);

  useEffect(() => {
    const adjacentAnchors =
      historyCalendarMode === 'month'
        ? [addMonths(historyMonth, -1), ...(canGoToNextHistoryMonth ? [addMonths(historyMonth, 1)] : [])]
        : [addYears(today, historyCalendarMode === 'year' ? -1 : -HISTORY_MULTI_YEAR_COUNT)];

    for (const anchor of adjacentAnchors) {
      const range = getHistoryCalendarRange(anchor, historyCalendarMode);
      queryClient
        .prefetchQuery({
          queryKey: queryKeys.workoutSessionsForRange(range.startLocalDate, range.endLocalDate),
          queryFn: () => listWorkoutSessionsForRange(range.startLocalDate, range.endLocalDate),
          staleTime: HISTORY_CALENDAR_STALE_TIME_MS,
        })
        .catch(() => undefined);
    }
  }, [canGoToNextHistoryMonth, historyCalendarMode, historyMonth, queryClient, todayMonthKey]);

  const startRoutine = useMutation({
    mutationFn: (routineId: string) => startWorkoutFromRoutine(routineId),
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.recentWorkouts });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
      openLiveWorkout(sessionId);
    },
  });

  const startEmpty = useMutation({
    mutationFn: () => startEmptyWorkout(),
    onSuccess: (sessionId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeWorkout });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.workoutSessions });
      openLiveWorkout(sessionId);
    },
  });

  if (routines.isLoading || recent.isLoading || workoutPlans.isLoading || programSchedule.isLoading || workoutSessions.isLoading || exercises.isLoading) {
    return <LoadingState label="Loading workouts" />;
  }

  const recentList = recent.data ?? [];
  const planList = workoutPlans.data ?? [];
  const sessionRange = workoutSessions.data ?? [];
  const historyCalendarSessionRange = historyCalendarSessions.data ?? [];
  const exerciseList = exercises.data ?? [];
  const weekScheduleDays = programSchedule.data ?? [];
  const suggestedRoutine = routineList[0];
  const planMap = new Map(planList.map((plan) => [plan.localDate, plan]));
  const groupedSessions = sessionsByLocalDate(sessionRange);
  const historyWorkoutsByDate = latestCompletedWorkoutByLocalDate(historyCalendarSessionRange);
  const historyWorkoutCountsByDate = completedWorkoutCountByLocalDate(historyCalendarSessionRange);
  const historyCalendarDays = buildMonthCalendarDays(historyMonth);
  const historyYearMonths = buildHistoryYearMonths(historyCalendarAnchor);
  const historyCalendarYears = Array.from({ length: HISTORY_MULTI_YEAR_COUNT }, (_, index) => historyYear - HISTORY_MULTI_YEAR_COUNT + 1 + index);
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
  const programGroups = groupsLoaded ? workoutGroups : buildDefaultGroups(routineList);
  const routinesById = new Map(routineList.map((routine) => [routine.id, routine]));

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

  const animateNextLayout = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
  };

  const toggleGroup = (groupId: string) => {
    animateNextLayout();
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  const ensureLoadedGroups = () => (groupsLoaded ? workoutGroups : buildDefaultGroups(routineList));

  const createGroup = () => {
    const baseGroups = ensureLoadedGroups();
    const nextGroup: WorkoutGroup = {
      id: createGroupId('new-group'),
      name: `New group ${baseGroups.length + 1}`,
      routineIds: [],
    };

    animateNextLayout();
    setWorkoutGroups([...baseGroups, nextGroup]);
    setExpandedGroupIds((current) => new Set([...current, nextGroup.id]));
    setGroupsLoaded(true);
  };

  const renameGroup = (group: WorkoutGroup) => {
    Alert.prompt(
      'Rename group',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save',
          onPress: (value?: string) => {
            const nextName = value?.trim() ?? '';
            if (!nextName) {
              return;
            }
            setWorkoutGroups((current) => current.map((item) => (item.id === group.id ? { ...item, name: nextName } : item)));
          },
        },
      ],
      'plain-text',
      group.name,
    );
  };

  const duplicateGroup = (group: WorkoutGroup) => {
    const nextGroup: WorkoutGroup = {
      id: createGroupId(group.name),
      name: `${group.name} copy`,
      routineIds: [...group.routineIds],
    };

    animateNextLayout();
    setWorkoutGroups((current) => {
      const index = current.findIndex((item) => item.id === group.id);
      if (index === -1) {
        return [...current, nextGroup];
      }
      return [...current.slice(0, index + 1), nextGroup, ...current.slice(index + 1)];
    });
    setExpandedGroupIds((current) => new Set([...current, nextGroup.id]));
  };

  const reorderTemplates = (group: WorkoutGroup) => {
    animateNextLayout();
    setWorkoutGroups((current) =>
      current.map((item) => (item.id === group.id ? { ...item, routineIds: [...item.routineIds].reverse() } : item)),
    );
  };

  const deleteGroup = (group: WorkoutGroup) => {
    Alert.alert('Delete group?', 'Templates will stay saved and move to Ungrouped.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete group',
        style: 'destructive',
        onPress: () => {
          animateNextLayout();
          setWorkoutGroups((current) => {
            const remainingGroups = current.filter((item) => item.id !== group.id);
            if (!group.routineIds.length) {
              return remainingGroups;
            }

            const ungroupedIndex = remainingGroups.findIndex((item) => item.id === 'group-ungrouped');
            if (ungroupedIndex === -1) {
              return [...remainingGroups, { id: 'group-ungrouped', name: 'Ungrouped', routineIds: [...group.routineIds] }];
            }

            return remainingGroups.map((item, index) =>
              index === ungroupedIndex ? { ...item, routineIds: [...item.routineIds, ...group.routineIds] } : item,
            );
          });
          setExpandedGroupIds((current) => {
            const next = new Set(current);
            next.delete(group.id);
            if (group.routineIds.length) {
              next.add('group-ungrouped');
            }
            return next;
          });
        },
      },
    ]);
  };

  const showGroupActions = (group: WorkoutGroup) => {
    Alert.alert(group.name, 'Group actions', [
      { text: 'Rename group', onPress: () => renameGroup(group) },
      { text: 'Reorder templates', onPress: () => reorderTemplates(group) },
      { text: 'Duplicate group', onPress: () => duplicateGroup(group) },
      { text: 'Delete group', style: 'destructive', onPress: () => deleteGroup(group) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const moveTemplateToTop = (group: WorkoutGroup, routine: Routine) => {
    setWorkoutGroups((current) =>
      current.map((item) =>
        item.id === group.id ? { ...item, routineIds: [routine.id, ...item.routineIds.filter((routineId) => routineId !== routine.id)] } : item,
      ),
    );
  };

  const showTemplateActions = (group: WorkoutGroup, routine: Routine) => {
    Alert.alert(routine.name, 'Template actions', [
      { text: 'Start workout', onPress: () => startRoutine.mutate(routine.id) },
      { text: 'Move to top', onPress: () => moveTemplateToTop(group, routine) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const renderTemplateCard = (group: WorkoutGroup, routine: Routine) => (
    <Pressable
      key={routine.id}
      onPress={() => startRoutine.mutate(routine.id)}
      onLongPress={() => showTemplateActions(group, routine)}
      style={({ pressed }) => [
        styles.templateCard,
        { backgroundColor: theme.colors.surfaceAlt, borderColor: theme.colors.border, opacity: pressed ? 0.84 : 1 },
      ]}
    >
      <View style={styles.templateTopRow}>
        <View style={[styles.templateIcon, { backgroundColor: theme.colors.surface, borderColor: theme.colors.primary }]}>
          <Dumbbell size={19} color={theme.colors.primary} />
        </View>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => showTemplateActions(group, routine)}
          style={({ pressed }) => [styles.templateMenuButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <EllipsisVertical size={18} color={theme.colors.muted} />
        </Pressable>
      </View>
      <AppText weight="800" numberOfLines={1} style={styles.templateName}>
        {routine.name}
      </AppText>
      <AppText muted variant="small" numberOfLines={2} style={styles.templateSubtitle}>
        {routineMuscleGroups(routine)}
      </AppText>
      <AppText muted variant="small">
        {routine.exercises.length} exercises
      </AppText>
    </Pressable>
  );

  const renderAddTemplateCard = (group: WorkoutGroup) => (
    <Pressable
      key={`${group.id}-add-template`}
      onPress={() => Alert.alert('Add template', `Template creation can be opened for ${group.name}.`)}
      style={({ pressed }) => [
        styles.addTemplateCard,
        { borderColor: theme.colors.border, backgroundColor: theme.colors.surface, opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <Plus size={23} color={theme.colors.muted} />
      <AppText muted variant="small" weight="700">
        Add template
      </AppText>
    </Pressable>
  );

  const renderWorkoutGroup = (group: WorkoutGroup) => {
    const expanded = expandedGroupIds.has(group.id);
    const groupRoutines = group.routineIds.map((routineId) => routinesById.get(routineId)).filter((routine): routine is Routine => Boolean(routine));
    const ChevronIcon = expanded ? ChevronUp : ChevronDown;

    return (
      <Card key={group.id} style={styles.groupCard}>
        <View style={styles.groupHeader}>
          <Pressable onPress={() => toggleGroup(group.id)} onLongPress={() => showGroupActions(group)} style={styles.groupHeaderMain}>
            <AppText weight="800" style={styles.groupTitle}>
              {group.name}
            </AppText>
            <AppText muted>{templateCountLabel(groupRoutines.length)}</AppText>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => showGroupActions(group)}
            style={({ pressed }) => [styles.groupIconButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <EllipsisVertical size={19} color={theme.colors.muted} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => toggleGroup(group.id)}
            style={({ pressed }) => [styles.groupIconButton, { opacity: pressed ? 0.7 : 1 }]}
          >
            <ChevronIcon size={20} color={theme.colors.muted} />
          </Pressable>
        </View>

        {expanded ? (
          <View style={styles.templateGrid}>
            {groupRoutines.map((routine) => renderTemplateCard(group, routine))}
            {renderAddTemplateCard(group)}
          </View>
        ) : null}
      </Card>
    );
  };

  const renderWorkoutGroups = () =>
    programGroups.length ? (
      programGroups.map(renderWorkoutGroup)
    ) : (
      <EmptyState
        icon={Dumbbell}
        title="No groups yet"
        body="Create a group to organize saved workout templates."
        actionLabel="New group"
        onAction={createGroup}
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
                  openLiveWorkout(activeToday.id);
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
          {weekScheduleDays.map((day, index) => {
            const iconColor =
              day.activityType === 'rest'
                ? theme.colors.muted
                : day.activityType === 'cardio'
                  ? theme.colors.warning
                  : day.activityType === 'padel'
                    ? theme.colors.info
                    : day.activityType === 'golf'
                      ? theme.colors.primary
                      : day.activityType === 'recovery'
                        ? theme.colors.primary
                        : theme.colors.primary;
            const Icon = iconForProgramDay(day);
            return (
              <View
                key={day.localDate}
                style={[styles.programCell, index > 0 && { borderLeftColor: theme.colors.border, borderLeftWidth: StyleSheet.hairlineWidth }]}
              >
                <AppText muted variant="small" numberOfLines={1}>
                  {format(new Date(`${day.localDate}T00:00:00`), 'EEE')}
                </AppText>
                <Icon size={18} color={iconColor} />
                <AppText
                  weight="700"
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.72}
                  style={styles.programTitle}
                >
                  {scheduleTitleForCell(day.title)}
                </AppText>
              </View>
            );
          })}
        </View>
        <Button label="Edit program" icon={Pencil} variant="secondary" onPress={() => navigation.navigate('EditProgram', { initialLocalDate: todayKey })} />
      </Card>

      <View style={styles.spaceBetween}>
        <AppText variant="section">My groups</AppText>
        <Pressable
          accessibilityRole="button"
          onPress={createGroup}
          style={({ pressed }) => [styles.newGroupButton, { opacity: pressed ? 0.75 : 1 }]}
        >
          <Plus size={15} color={theme.colors.primary} />
          <AppText weight="800" style={{ color: theme.colors.primary }}>
            New group
          </AppText>
        </Pressable>
      </View>
      {renderWorkoutGroups()}
    </>
  );

  const getHistoryHeatmapStyle = (date?: Date | null) => {
    if (!date) {
      return { backgroundColor: 'transparent', opacity: 0 };
    }
    const count = historyWorkoutCountsByDate.get(localDateKey(date)) ?? 0;
    if (count <= 0) {
      return { backgroundColor: theme.colors.surfaceAlt, opacity: 0.72 };
    }
    return { backgroundColor: theme.colors.primary, opacity: Math.min(1, 0.54 + count * 0.14) };
  };

  const shiftHistoryCalendar = (direction: -1 | 1) => {
    setHistoryMonth((current) => clampToLatestMonth(addMonths(current, direction), today));
  };

  const renderHistoryCalendarTabs = () => (
    <View style={[styles.calendarModeRow, { backgroundColor: theme.colors.surfaceAlt }]}>
      {HISTORY_CALENDAR_MODES.map((item) => {
        const active = historyCalendarMode === item.key;
        return (
          <Pressable
            key={item.key}
            onPress={() => setHistoryCalendarMode(item.key)}
            style={({ pressed }) => [
              styles.calendarModeButton,
              { backgroundColor: active ? theme.colors.surface : 'transparent', opacity: pressed ? 0.82 : 1 },
            ]}
          >
            <AppText weight={active ? '800' : '600'} style={{ color: active ? theme.colors.text : theme.colors.muted }}>
              {item.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );

  const renderMonthCalendar = () => (
    <>
      <View style={styles.monthHeader}>
        <Pressable
          accessibilityRole="button"
          onPress={() => shiftHistoryCalendar(-1)}
          style={({ pressed }) => [styles.monthNavButton, { opacity: pressed ? 0.7 : 1 }]}
        >
          <ChevronLeft size={20} color={theme.colors.text} />
        </Pressable>
        <AppText weight="800" style={styles.monthTitle}>
          {format(historyMonth, 'MMMM yyyy')}
        </AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canGoToNextHistoryMonth }}
          disabled={!canGoToNextHistoryMonth}
          onPress={() => shiftHistoryCalendar(1)}
          style={({ pressed }) => [styles.monthNavButton, { opacity: !canGoToNextHistoryMonth ? 0.35 : pressed ? 0.7 : 1 }]}
        >
          <ChevronRight size={20} color={canGoToNextHistoryMonth ? theme.colors.text : theme.colors.muted} />
        </Pressable>
      </View>

      <View style={styles.monthWeekdayRow}>
        {HISTORY_WEEKDAYS.map((weekday) => (
          <View key={weekday} style={styles.monthWeekdayCell}>
            <AppText muted variant="small">
              {weekday}
            </AppText>
          </View>
        ))}
      </View>

      <View style={styles.monthGrid}>
        {historyCalendarDays.map((date, index) => {
          if (!date) {
            return <View key={`empty-${index}`} style={styles.monthDayCell} />;
          }

          const workout = historyWorkoutsByDate.get(localDateKey(date));
          return (
            <Pressable
              key={localDateKey(date)}
              disabled={!workout}
              onPress={workout ? () => navigation.navigate('WorkoutSummary', { sessionId: workout.id }) : undefined}
              style={({ pressed }) => [styles.monthDayCell, { opacity: pressed ? 0.72 : 1 }]}
            >
              <View
                style={[
                  styles.monthDayCircle,
                  workout && {
                    borderColor: theme.colors.primary,
                    borderWidth: 1.6,
                    shadowColor: theme.colors.primary,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: 0.18,
                    shadowRadius: 4,
                  },
                ]}
              >
                <AppText weight="600">{date.getDate()}</AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </>
  );

  const renderMiniMonth = (monthDate: Date) => {
    const selectedMonth = monthTimestamp(monthDate) === monthTimestamp(historyCalendarAnchor);
    const futureMonth = isFutureMonth(monthDate, today);
    return (
      <Pressable
        key={format(monthDate, 'yyyy-MM')}
        accessibilityState={{ disabled: futureMonth }}
        disabled={futureMonth}
        onPress={() => {
          setHistoryMonth(clampToLatestMonth(monthDate, today));
          setHistoryCalendarMode('month');
        }}
        style={({ pressed }) => [
          styles.yearMonthTile,
          { borderColor: selectedMonth ? theme.colors.primary : 'transparent', opacity: futureMonth ? 0.45 : pressed ? 0.78 : 1 },
        ]}
      >
        <AppText weight="800" variant="small" style={styles.yearMonthTitle}>
          {format(monthDate, monthDate.getFullYear() === historyYear ? 'MMM' : 'MMM yy')}
        </AppText>
        <View style={styles.yearMonthHeatmap}>
          {buildMonthCalendarDays(monthDate).map((date, index) => (
            <View key={`${format(monthDate, 'yyyy-MM')}-${index}`} style={[styles.yearMonthDot, getHistoryHeatmapStyle(date)]} />
          ))}
        </View>
      </Pressable>
    );
  };

  const renderYearCalendar = () => (
    <View style={styles.yearCalendarGrid}>
      {historyYearMonths.map((monthDate) => renderMiniMonth(monthDate))}
    </View>
  );

  const renderYearStrip = (year: number) => (
    <Pressable
      key={year}
      onPress={() => {
        setHistoryCalendarMode('year');
      }}
      style={({ pressed }) => [
        styles.multiYearItem,
        { borderColor: year === historyYear ? theme.colors.primary : theme.colors.border, opacity: pressed ? 0.78 : 1 },
      ]}
    >
      <AppText weight="800">{year}</AppText>
      <View style={styles.multiYearTimeline}>
        <View style={styles.multiYearMonthLabels}>
          {HISTORY_MONTH_LABELS.map((label) => (
            <AppText key={`${year}-${label}`} muted variant="small" style={styles.multiYearMonthLabel}>
              {label}
            </AppText>
          ))}
        </View>
        <View style={styles.multiYearStrip}>
          {buildYearHeatmapWeeks(year).map((week, weekIndex) => (
            <View key={`${year}-week-${weekIndex}`} style={styles.multiYearWeek}>
              {week.map((date, dayIndex) => (
                <View key={`${year}-${weekIndex}-${dayIndex}`} style={[styles.multiYearDot, getHistoryHeatmapStyle(date)]} />
              ))}
            </View>
          ))}
        </View>
      </View>
    </Pressable>
  );

  const renderMultiYearCalendar = () => (
    <View style={styles.multiYearList}>
      {historyCalendarYears.map((year) => renderYearStrip(year))}
    </View>
  );

  const renderHistoryCalendar = () => (
    <Card style={styles.monthCalendarCard}>
      {renderHistoryCalendarTabs()}

      {historyCalendarMode === 'month' ? renderMonthCalendar() : null}
      {historyCalendarMode === 'year' ? (
        <View style={styles.calendarScrollViewport}>
          <ScrollView
            ref={historyYearScrollRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.calendarScrollContent}
            onContentSizeChange={() => historyYearScrollRef.current?.scrollToEnd({ animated: false })}
          >
            {renderYearCalendar()}
          </ScrollView>
        </View>
      ) : null}
      {historyCalendarMode === 'multiYear' ? (
        <View style={styles.calendarScrollViewport}>
          <ScrollView
            ref={historyMultiYearScrollRef}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.calendarScrollContent}
            onContentSizeChange={() => historyMultiYearScrollRef.current?.scrollToEnd({ animated: false })}
          >
            {renderMultiYearCalendar()}
          </ScrollView>
        </View>
      ) : null}
    </Card>
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

      {renderHistoryCalendar()}

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
    <Screen resetScrollOnBlur>
      <View style={styles.header}>
        <View>
          <AppText variant="title">Workouts</AppText>
          <AppText muted>Templates, history, and active logging.</AppText>
        </View>
        <Button label="+ Empty" variant="secondary" onPress={() => startEmpty.mutate()} />
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
  monthCalendarCard: {
    gap: 12,
    height: 386,
  },
  calendarModeRow: {
    borderRadius: 9,
    flexDirection: 'row',
    padding: 3,
  },
  calendarModeButton: {
    alignItems: 'center',
    borderRadius: 7,
    flex: 1,
    minHeight: 34,
    justifyContent: 'center',
  },
  monthHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  monthNavButton: {
    alignItems: 'center',
    borderRadius: 10,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  monthTitle: {
    fontSize: 16,
  },
  monthWeekdayRow: {
    flexDirection: 'row',
  },
  monthWeekdayCell: {
    alignItems: 'center',
    flex: 1,
  },
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  monthDayCell: {
    alignItems: 'center',
    height: 38,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  monthDayCircle: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: 'transparent',
    borderRadius: 15,
    borderWidth: 1.6,
    height: 30,
    justifyContent: 'center',
    width: 30,
  },
  calendarScrollViewport: {
    flex: 1,
    overflow: 'hidden',
  },
  calendarScrollContent: {
    paddingBottom: 2,
  },
  yearCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  yearMonthTile: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 9,
    minHeight: 118,
    paddingHorizontal: 8,
    paddingVertical: 10,
    width: '31.5%',
  },
  yearMonthTitle: {
    fontSize: 12,
    textAlign: 'center',
  },
  yearMonthHeatmap: {
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 2.5,
    width: 82,
  },
  yearMonthDot: {
    borderRadius: 3,
    height: 9,
    width: 9,
  },
  multiYearList: {
    gap: 12,
  },
  multiYearItem: {
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 8,
    padding: 8,
  },
  multiYearTimeline: {
    gap: 5,
  },
  multiYearMonthLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  multiYearMonthLabel: {
    fontSize: 7.5,
    lineHeight: 10,
    minWidth: 16,
    textAlign: 'center',
  },
  multiYearStrip: {
    flexDirection: 'row',
    gap: 2,
    justifyContent: 'space-between',
  },
  multiYearWeek: {
    gap: 2,
  },
  multiYearDot: {
    borderRadius: 1.5,
    height: 4,
    width: 4,
  },
  listCard: {
    gap: 0,
  },
  newGroupButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 36,
    paddingLeft: 8,
  },
  groupCard: {
    gap: 10,
  },
  groupHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  groupHeaderMain: {
    flex: 1,
    gap: 3,
    minHeight: 42,
    justifyContent: 'center',
  },
  groupTitle: {
    fontSize: 15,
  },
  groupIconButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 30,
  },
  templateGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  templateCard: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
    minHeight: 122,
    padding: 10,
    width: '48.5%',
  },
  addTemplateCard: {
    alignItems: 'center',
    borderRadius: 10,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: 7,
    minHeight: 122,
    justifyContent: 'center',
    padding: 10,
    width: '48.5%',
  },
  templateTopRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  templateIcon: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  templateMenuButton: {
    alignItems: 'center',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 22,
  },
  templateName: {
    fontSize: 14,
    lineHeight: 18,
  },
  templateSubtitle: {
    minHeight: 30,
  },
  savedTitle: {
    fontSize: 15,
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
