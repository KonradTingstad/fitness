import { ProgressOverviewMetric } from '@/features/progress/widgets/types';

export interface ProgressOverviewMetricDefinition {
  metric: ProgressOverviewMetric;
  title: string;
  description: string;
}

export const PROGRESS_OVERVIEW_METRIC_CATALOG: ProgressOverviewMetricDefinition[] = [
  { metric: 'weight_change', title: 'Weight change', description: 'Change vs. selected range.' },
  { metric: 'workouts_completed', title: 'Workouts', description: 'Completed sessions in range.' },
  { metric: 'workouts_target', title: 'Workout target', description: 'Planned sessions per week.' },
  { metric: 'workout_completion', title: 'Workout completion', description: 'Completed vs. target (%).' },
  { metric: 'protein_average', title: 'Protein avg', description: 'Average intake in selected range.' },
  { metric: 'protein_goal', title: 'Protein goal', description: 'Daily protein target.' },
  { metric: 'calorie_adherence', title: 'Calorie adherence', description: 'How close intake is to target.' },
  { metric: 'logged_days', title: 'Logged days', description: 'Days with logged nutrition data.' },
];

export const DEFAULT_PROGRESS_OVERVIEW_METRICS: ProgressOverviewMetric[] = [
  'weight_change',
  'workouts_completed',
  'protein_average',
  'calorie_adherence',
];

export const MAX_PROGRESS_OVERVIEW_MODULES = 4;

export function isProgressOverviewMetric(metric: string): metric is ProgressOverviewMetric {
  return PROGRESS_OVERVIEW_METRIC_CATALOG.some((item) => item.metric === metric);
}
