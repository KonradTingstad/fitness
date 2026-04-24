export type ProgressWidgetCategory = 'body' | 'nutrition' | 'training' | 'exercise';

export type ProgressWidgetMetric =
  | 'body_weight'
  | 'body_measurements'
  | 'progress_photos'
  | 'calories_over_time'
  | 'protein_average'
  | 'macro_split'
  | 'calorie_adherence'
  | 'workouts_per_week'
  | 'weekly_volume'
  | 'training_duration'
  | 'sets_per_week'
  | 'best_set_over_time'
  | 'estimated_1rm'
  | 'volume_per_session';

export type ProgressWidgetChartType = 'line' | 'bar';
export type ProgressWidgetTimeRange = '7D' | '30D' | '90D' | '1Y' | 'All';
export type ProgressWidgetGrouping = 'day' | 'week' | 'workout';

export interface ProgressWidgetConfig {
  id: string;
  type: ProgressWidgetCategory;
  metric: ProgressWidgetMetric;
  chartType: ProgressWidgetChartType;
  timeRange: ProgressWidgetTimeRange;
  exerciseId?: string;
  unit?: string;
  grouping?: ProgressWidgetGrouping;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProgressWidgetDraft {
  type: ProgressWidgetCategory;
  metric: ProgressWidgetMetric;
  chartType: ProgressWidgetChartType;
  timeRange: ProgressWidgetTimeRange;
  exerciseId?: string;
  unit?: string;
  grouping?: ProgressWidgetGrouping;
}

export interface ProgressChartPoint {
  label: string;
  value: number;
}

export interface ProgressWidgetSeries {
  points: ProgressChartPoint[];
  emptyMessage?: string;
  latestValue?: number;
  changeFromStart?: number;
}

export interface ProgressOverviewStats {
  weightChangeKg?: number;
  workoutsCompleted: number;
  workoutsTarget: number;
  proteinAverageG: number;
  proteinGoalG: number;
  calorieAdherencePct: number;
  adherenceDays: number;
}

export type ProgressOverviewMetric =
  | 'weight_change'
  | 'workouts_completed'
  | 'workouts_target'
  | 'workout_completion'
  | 'protein_average'
  | 'protein_goal'
  | 'calorie_adherence'
  | 'logged_days';

export interface ProgressOverviewModuleConfig {
  id: string;
  metric: ProgressOverviewMetric;
  position: number;
  createdAt: string;
  updatedAt: string;
}
