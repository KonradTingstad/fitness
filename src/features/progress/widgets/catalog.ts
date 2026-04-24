import { ProgressWidgetCategory, ProgressWidgetChartType, ProgressWidgetGrouping, ProgressWidgetMetric, ProgressWidgetTimeRange } from '@/features/progress/widgets/types';

export interface ProgressMetricDefinition {
  category: ProgressWidgetCategory;
  metric: ProgressWidgetMetric;
  title: string;
  subtitle: string;
  description: string;
  defaultChartType: ProgressWidgetChartType;
  defaultTimeRange: ProgressWidgetTimeRange;
  defaultUnit: string;
  defaultGrouping: ProgressWidgetGrouping;
  supportedChartTypes: ProgressWidgetChartType[];
  supportedGroupings: ProgressWidgetGrouping[];
  unitOptions: string[];
  requiresExercise?: boolean;
}

export const TIME_RANGE_OPTIONS: ProgressWidgetTimeRange[] = ['7D', '30D', '90D', '1Y', 'All'];
export const GROUPING_OPTIONS: ProgressWidgetGrouping[] = ['day', 'week', 'workout'];
export const CHART_TYPE_OPTIONS: ProgressWidgetChartType[] = ['line', 'bar'];

export const CATEGORY_LABELS: Record<ProgressWidgetCategory, string> = {
  body: 'Body',
  nutrition: 'Nutrition',
  training: 'Training',
  exercise: 'Exercise',
};

export const TIME_RANGE_LABELS: Record<ProgressWidgetTimeRange, string> = {
  '7D': '7 days',
  '30D': '30 days',
  '90D': '90 days',
  '1Y': '1 year',
  All: 'All time',
};

export const GROUPING_LABELS: Record<ProgressWidgetGrouping, string> = {
  day: 'Per day',
  week: 'Per week',
  workout: 'Per workout',
};

export const CHART_TYPE_LABELS: Record<ProgressWidgetChartType, string> = {
  line: 'Line chart',
  bar: 'Bar chart',
};

export const PROGRESS_METRIC_CATALOG: ProgressMetricDefinition[] = [
  {
    category: 'body',
    metric: 'body_weight',
    title: 'Body weight',
    subtitle: 'Line chart',
    description: 'Track body weight trend over time.',
    defaultChartType: 'line',
    defaultTimeRange: '30D',
    defaultUnit: 'kg',
    defaultGrouping: 'day',
    supportedChartTypes: ['line', 'bar'],
    supportedGroupings: ['day', 'week'],
    unitOptions: ['kg', 'lb'],
  },
  {
    category: 'body',
    metric: 'body_measurements',
    title: 'Measurements',
    subtitle: 'Line chart',
    description: 'Track circumferences and measurement changes.',
    defaultChartType: 'line',
    defaultTimeRange: '90D',
    defaultUnit: 'cm',
    defaultGrouping: 'week',
    supportedChartTypes: ['line', 'bar'],
    supportedGroupings: ['day', 'week'],
    unitOptions: ['cm', 'in'],
  },
  {
    category: 'body',
    metric: 'progress_photos',
    title: 'Progress photos',
    subtitle: 'Image overview',
    description: 'See how often progress photos are logged.',
    defaultChartType: 'bar',
    defaultTimeRange: '90D',
    defaultUnit: 'photos',
    defaultGrouping: 'week',
    supportedChartTypes: ['bar', 'line'],
    supportedGroupings: ['day', 'week'],
    unitOptions: ['photos'],
  },
  {
    category: 'nutrition',
    metric: 'calories_over_time',
    title: 'Calories over time',
    subtitle: 'Line chart',
    description: 'Daily calorie intake trend.',
    defaultChartType: 'line',
    defaultTimeRange: '30D',
    defaultUnit: 'kcal',
    defaultGrouping: 'day',
    supportedChartTypes: ['line', 'bar'],
    supportedGroupings: ['day', 'week'],
    unitOptions: ['kcal', 'kJ'],
  },
  {
    category: 'nutrition',
    metric: 'protein_average',
    title: 'Protein average',
    subtitle: 'Line chart',
    description: 'Average protein intake per day.',
    defaultChartType: 'line',
    defaultTimeRange: '30D',
    defaultUnit: 'g',
    defaultGrouping: 'day',
    supportedChartTypes: ['line', 'bar'],
    supportedGroupings: ['day', 'week'],
    unitOptions: ['g'],
  },
  {
    category: 'nutrition',
    metric: 'macro_split',
    title: 'Macro split',
    subtitle: 'Bar chart',
    description: 'Protein, carbs, and fat distribution.',
    defaultChartType: 'bar',
    defaultTimeRange: '30D',
    defaultUnit: 'g',
    defaultGrouping: 'day',
    supportedChartTypes: ['bar', 'line'],
    supportedGroupings: ['day', 'week'],
    unitOptions: ['g'],
  },
  {
    category: 'nutrition',
    metric: 'calorie_adherence',
    title: 'Calorie adherence',
    subtitle: 'Bar chart',
    description: 'How close daily intake is to calorie target.',
    defaultChartType: 'bar',
    defaultTimeRange: '30D',
    defaultUnit: '%',
    defaultGrouping: 'day',
    supportedChartTypes: ['bar', 'line'],
    supportedGroupings: ['day', 'week'],
    unitOptions: ['%'],
  },
  {
    category: 'training',
    metric: 'workouts_per_week',
    title: 'Workouts per week',
    subtitle: 'Bar chart',
    description: 'Completed workout sessions over time.',
    defaultChartType: 'bar',
    defaultTimeRange: '90D',
    defaultUnit: 'sessions',
    defaultGrouping: 'week',
    supportedChartTypes: ['bar', 'line'],
    supportedGroupings: ['day', 'week'],
    unitOptions: ['sessions'],
  },
  {
    category: 'training',
    metric: 'weekly_volume',
    title: 'Weekly volume',
    subtitle: 'Bar chart',
    description: 'Total lifted volume (weight × reps).',
    defaultChartType: 'bar',
    defaultTimeRange: '90D',
    defaultUnit: 'kg',
    defaultGrouping: 'week',
    supportedChartTypes: ['bar', 'line'],
    supportedGroupings: ['day', 'week', 'workout'],
    unitOptions: ['kg'],
  },
  {
    category: 'training',
    metric: 'training_duration',
    title: 'Training duration',
    subtitle: 'Line chart',
    description: 'Minutes spent training.',
    defaultChartType: 'line',
    defaultTimeRange: '30D',
    defaultUnit: 'min',
    defaultGrouping: 'week',
    supportedChartTypes: ['line', 'bar'],
    supportedGroupings: ['day', 'week', 'workout'],
    unitOptions: ['min'],
  },
  {
    category: 'training',
    metric: 'sets_per_week',
    title: 'Sets per week',
    subtitle: 'Bar chart',
    description: 'Completed sets trend.',
    defaultChartType: 'bar',
    defaultTimeRange: '90D',
    defaultUnit: 'sets',
    defaultGrouping: 'week',
    supportedChartTypes: ['bar', 'line'],
    supportedGroupings: ['day', 'week', 'workout'],
    unitOptions: ['sets'],
  },
  {
    category: 'exercise',
    metric: 'best_set_over_time',
    title: 'Best set over time',
    subtitle: 'Line chart',
    description: 'Best set trend (weight × reps).',
    defaultChartType: 'line',
    defaultTimeRange: '90D',
    defaultUnit: 'kg·reps',
    defaultGrouping: 'workout',
    supportedChartTypes: ['line', 'bar'],
    supportedGroupings: ['day', 'week', 'workout'],
    unitOptions: ['kg·reps'],
    requiresExercise: true,
  },
  {
    category: 'exercise',
    metric: 'estimated_1rm',
    title: 'Estimated 1RM',
    subtitle: 'Line chart',
    description: 'Estimated one rep max over time.',
    defaultChartType: 'line',
    defaultTimeRange: '90D',
    defaultUnit: 'kg',
    defaultGrouping: 'workout',
    supportedChartTypes: ['line', 'bar'],
    supportedGroupings: ['day', 'week', 'workout'],
    unitOptions: ['kg', 'lb'],
    requiresExercise: true,
  },
  {
    category: 'exercise',
    metric: 'volume_per_session',
    title: 'Volume per session',
    subtitle: 'Bar chart',
    description: 'Total exercise volume per workout.',
    defaultChartType: 'bar',
    defaultTimeRange: '90D',
    defaultUnit: 'kg',
    defaultGrouping: 'workout',
    supportedChartTypes: ['bar', 'line'],
    supportedGroupings: ['day', 'week', 'workout'],
    unitOptions: ['kg'],
    requiresExercise: true,
  },
];

export function getMetricDefinition(metric: ProgressWidgetMetric): ProgressMetricDefinition {
  const item = PROGRESS_METRIC_CATALOG.find((candidate) => candidate.metric === metric);
  if (!item) {
    throw new Error(`Unknown progress metric: ${metric}`);
  }
  return item;
}

export function getMetricsByCategory(category: ProgressWidgetCategory): ProgressMetricDefinition[] {
  return PROGRESS_METRIC_CATALOG.filter((item) => item.category === category);
}
