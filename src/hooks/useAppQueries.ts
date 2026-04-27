import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getBodyWeightTrend, getDashboardSummary } from '@/data/repositories/dashboardRepository';
import {
  getCalorieGoalStreak,
  getDiary,
  getFrequentlyLoggedFoods,
  getNutritionTotalsForDates,
  getRecentFoods,
  getRecipes,
  getSavedMeals,
  searchFoodItems,
} from '@/data/repositories/nutritionRepository';
import {
  getProgressOverviewStats,
  getProgressWidgetSeries,
  listProgressOverviewModules,
  listProgressWidgets,
} from '@/data/repositories/progressWidgetsRepository';
import { getMealsPerDayTarget, getProfileBundle } from '@/data/repositories/settingsRepository';
import { ProgressWidgetGrouping, ProgressWidgetMetric, ProgressWidgetTimeRange } from '@/features/progress/widgets/types';
import {
  getActiveWorkout,
  getExerciseHistory,
  getRecentWorkouts,
  getWorkoutProgress,
  getWorkoutSession,
  listProgramScheduleForRange,
  listWorkoutPlansForRange,
  listWorkoutSessionsForRange,
  listExercises,
  listRoutines,
} from '@/data/repositories/workoutRepository';
import { lastNDays, shiftLocalDate, toLocalDateKey } from '@/domain/calculations/dates';
import { queryKeys } from '@/hooks/queryKeys';

export function useDashboard() {
  return useQuery({ queryKey: queryKeys.dashboard, queryFn: () => getDashboardSummary() });
}

export function useRoutines() {
  return useQuery({ queryKey: queryKeys.routines, queryFn: () => listRoutines() });
}

export function useActiveWorkout() {
  return useQuery({ queryKey: queryKeys.activeWorkout, queryFn: () => getActiveWorkout(), refetchInterval: 30_000 });
}

export function useWorkoutSession(id: string) {
  return useQuery({ queryKey: queryKeys.workout(id), queryFn: () => getWorkoutSession(id), refetchInterval: 5_000 });
}

export function useRecentWorkouts() {
  return useQuery({ queryKey: queryKeys.recentWorkouts, queryFn: () => getRecentWorkouts() });
}

export function useWorkoutPlansForRange(startLocalDate: string, endLocalDate: string) {
  return useQuery({
    queryKey: queryKeys.workoutPlans(startLocalDate, endLocalDate),
    queryFn: () => listWorkoutPlansForRange(startLocalDate, endLocalDate),
  });
}

export function useProgramScheduleForRange(startLocalDate: string, endLocalDate: string) {
  return useQuery({
    queryKey: queryKeys.programSchedule(startLocalDate, endLocalDate),
    queryFn: () => listProgramScheduleForRange(startLocalDate, endLocalDate),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useWorkoutSessionsForRange(startLocalDate: string, endLocalDate: string) {
  return useQuery({
    queryKey: queryKeys.workoutSessionsForRange(startLocalDate, endLocalDate),
    queryFn: () => listWorkoutSessionsForRange(startLocalDate, endLocalDate),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useDiary(localDate = toLocalDateKey()) {
  return useQuery({ queryKey: queryKeys.diary(localDate), queryFn: () => getDiary(localDate) });
}

export function useWeeklyCalories(localDate = toLocalDateKey()) {
  const dates = Array.from({ length: 7 }, (_, index) => shiftLocalDate(localDate, index - 6));
  return useQuery({
    queryKey: queryKeys.weeklyCalories(localDate),
    queryFn: () => getNutritionTotalsForDates(dates),
  });
}

export function useCalorieStreak(localDate = toLocalDateKey()) {
  return useQuery({
    queryKey: queryKeys.calorieStreak(localDate),
    queryFn: () => getCalorieGoalStreak(localDate),
  });
}

export function useFoodSearch(query: string) {
  return useQuery({
    queryKey: queryKeys.foodSearch(query),
    queryFn: () => searchFoodItems(query),
    enabled: query.trim().length >= 0,
  });
}

export function useRecentFoods() {
  return useQuery({ queryKey: queryKeys.recentFoods, queryFn: () => getRecentFoods() });
}

export function useFrequentlyLoggedFoods() {
  return useQuery({ queryKey: queryKeys.frequentlyLoggedFoods, queryFn: () => getFrequentlyLoggedFoods() });
}

export function useNutritionLibrary() {
  return useQuery({
    queryKey: queryKeys.nutritionLibrary,
    queryFn: async () => ({ savedMeals: await getSavedMeals(), recipes: await getRecipes() }),
  });
}

export function useMealsPerDayTarget() {
  return useQuery({ queryKey: queryKeys.mealsPerDayTarget, queryFn: () => getMealsPerDayTarget() });
}

export function useProfileBundle() {
  return useQuery({ queryKey: queryKeys.profile, queryFn: () => getProfileBundle() });
}

export function useProgressData() {
  return useQuery({
    queryKey: queryKeys.progress,
    queryFn: async () => ({
      workout: await getWorkoutProgress(),
      weight: await getBodyWeightTrend(),
      nutrition: await getNutritionTotalsForDates(lastNDays(7)),
    }),
  });
}

export function useProgressOverview(range: ProgressWidgetTimeRange) {
  return useQuery({ queryKey: queryKeys.progressOverview(range), queryFn: () => getProgressOverviewStats(range) });
}

export function useProgressOverviewModules() {
  return useQuery({ queryKey: queryKeys.progressOverviewModules, queryFn: () => listProgressOverviewModules() });
}

export function useProgressWidgets() {
  return useQuery({ queryKey: queryKeys.progressWidgets, queryFn: () => listProgressWidgets() });
}

export function useProgressWidgetSeries(
  widgetId: string,
  updatedAt: string,
  input: { metric: ProgressWidgetMetric; grouping?: ProgressWidgetGrouping; timeRange: ProgressWidgetTimeRange; exerciseId?: string },
) {
  return useQuery({
    queryKey: queryKeys.progressWidgetData(widgetId, updatedAt),
    queryFn: () => getProgressWidgetSeries(input),
  });
}

export function useExercises() {
  return useQuery({ queryKey: queryKeys.exercises, queryFn: () => listExercises() });
}

export function useExerciseHistory(exerciseId: string) {
  return useQuery({ queryKey: queryKeys.exerciseHistory(exerciseId), queryFn: () => getExerciseHistory(exerciseId) });
}
