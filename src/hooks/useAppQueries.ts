import { useQuery } from '@tanstack/react-query';

import { getBodyWeightTrend, getDashboardSummary } from '@/data/repositories/dashboardRepository';
import { getDiary, getNutritionTotalsForDates, getRecentFoods, getRecipes, getSavedMeals, searchFoodItems } from '@/data/repositories/nutritionRepository';
import {
  getProgressOverviewStats,
  getProgressWidgetSeries,
  listProgressOverviewModules,
  listProgressWidgets,
} from '@/data/repositories/progressWidgetsRepository';
import { getProfileBundle } from '@/data/repositories/settingsRepository';
import { ProgressWidgetGrouping, ProgressWidgetMetric, ProgressWidgetTimeRange } from '@/features/progress/widgets/types';
import {
  getActiveWorkout,
  getExerciseHistory,
  getRecentWorkouts,
  getWorkoutProgress,
  getWorkoutSession,
  listExercises,
  listRoutines,
} from '@/data/repositories/workoutRepository';
import { lastNDays, toLocalDateKey } from '@/domain/calculations/dates';
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

export function useDiary(localDate = toLocalDateKey()) {
  return useQuery({ queryKey: queryKeys.diary(localDate), queryFn: () => getDiary(localDate) });
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

export function useNutritionLibrary() {
  return useQuery({
    queryKey: ['nutritionLibrary'],
    queryFn: async () => ({ savedMeals: await getSavedMeals(), recipes: await getRecipes() }),
  });
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
