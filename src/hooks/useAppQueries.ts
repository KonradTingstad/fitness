import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getBodyWeightTrend, getDashboardSummary } from '@/data/repositories/dashboardRepository';
import {
  getDailyCaffeineSummary,
  FoodSearchItemType,
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
  getCompletedWorkoutCount,
  getActiveWorkout,
  ExerciseSearchFilters,
  getExerciseFilterOptions,
  getExerciseHistory,
  getRecentWorkouts,
  getWorkoutProgress,
  getWorkoutSession,
  listProgramScheduleForRange,
  listProgramDayOutcomesForRange,
  listWorkoutPlansForRange,
  listWorkoutSessionsForRange,
  listExercises,
  listRoutines,
  searchExercises,
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
  return useQuery({
    queryKey: queryKeys.workout(id),
    queryFn: () => getWorkoutSession(id),
    refetchInterval: (query) => (query.state.data?.status === 'active' ? 5_000 : false),
  });
}

export function useRecentWorkouts() {
  return useQuery({ queryKey: queryKeys.recentWorkouts, queryFn: () => getRecentWorkouts() });
}

export function useCompletedWorkoutCount() {
  return useQuery({ queryKey: queryKeys.completedWorkoutCount, queryFn: () => getCompletedWorkoutCount() });
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

export function useProgramDayOutcomesForRange(startLocalDate: string, endLocalDate: string) {
  return useQuery({
    queryKey: queryKeys.programDayOutcomes(startLocalDate, endLocalDate),
    queryFn: () => listProgramDayOutcomesForRange(startLocalDate, endLocalDate),
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

export function useTodayCaffeine(localDate = toLocalDateKey()) {
  return useQuery({
    queryKey: queryKeys.caffeineToday(localDate),
    queryFn: () => getDailyCaffeineSummary(localDate),
  });
}

export function useFoodSearch(
  query: string,
  itemType: FoodSearchItemType = 'food',
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.foodSearch(query, itemType),
    queryFn: () => searchFoodItems(query, itemType),
    enabled: options?.enabled ?? true,
  });
}

export function useRecentFoods(itemType: FoodSearchItemType = 'food') {
  return useQuery({ queryKey: queryKeys.recentFoods(itemType), queryFn: () => getRecentFoods(itemType) });
}

export function useFrequentlyLoggedFoods(itemType: FoodSearchItemType = 'food') {
  return useQuery({ queryKey: queryKeys.frequentlyLoggedFoods(itemType), queryFn: () => getFrequentlyLoggedFoods(itemType) });
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
  return useQuery({
    queryKey: queryKeys.exercises,
    queryFn: () => listExercises(),
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useExerciseSearch(filters: ExerciseSearchFilters = {}) {
  return useQuery({
    queryKey: queryKeys.exerciseSearch(
      filters.query ?? '',
      filters.primaryMuscle ?? 'All',
      filters.equipment ?? 'All',
      filters.category ?? 'All',
    ),
    queryFn: () => searchExercises(filters),
  });
}

export function useExerciseFilterOptions() {
  return useQuery({ queryKey: queryKeys.exerciseFilterOptions, queryFn: () => getExerciseFilterOptions() });
}

export function useExerciseHistory(exerciseId: string) {
  return useQuery({ queryKey: queryKeys.exerciseHistory(exerciseId), queryFn: () => getExerciseHistory(exerciseId) });
}
