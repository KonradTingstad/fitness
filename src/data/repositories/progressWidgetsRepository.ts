import { format, parseISO, subDays, subYears } from 'date-fns';

import { getDatabase } from '@/data/db/database';
import { createId, DEMO_USER_ID } from '@/data/db/ids';
import { getMetricDefinition } from '@/features/progress/widgets/catalog';
import {
  DEFAULT_PROGRESS_OVERVIEW_METRICS,
  MAX_PROGRESS_OVERVIEW_MODULES,
  isProgressOverviewMetric,
} from '@/features/progress/widgets/overviewCatalog';
import {
  ProgressChartPoint,
  ProgressOverviewMetric,
  ProgressOverviewModuleConfig,
  ProgressOverviewStats,
  ProgressWidgetConfig,
  ProgressWidgetDraft,
  ProgressWidgetGrouping,
  ProgressWidgetMetric,
  ProgressWidgetSeries,
  ProgressWidgetTimeRange,
} from '@/features/progress/widgets/types';

type ProgressWidgetRow = {
  id: string;
  user_id: string;
  type: ProgressWidgetConfig['type'];
  metric: ProgressWidgetConfig['metric'];
  chart_type: ProgressWidgetConfig['chartType'];
  time_range: ProgressWidgetConfig['timeRange'];
  exercise_id: string | null;
  unit: string | null;
  grouping: ProgressWidgetGrouping | null;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

type ProgressOverviewModuleRow = {
  id: string;
  user_id: string;
  metric: string;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

const DEFAULT_WIDGET_METRICS: ProgressWidgetMetric[] = ['body_weight', 'workouts_per_week', 'calories_over_time'];

function sanitizeOverviewMetrics(metrics: ProgressOverviewMetric[]): ProgressOverviewMetric[] {
  const unique = Array.from(new Set(metrics.filter((metric) => isProgressOverviewMetric(metric))));
  if (!unique.length) {
    return DEFAULT_PROGRESS_OVERVIEW_METRICS.slice(0, MAX_PROGRESS_OVERVIEW_MODULES);
  }
  return unique.slice(0, MAX_PROGRESS_OVERVIEW_MODULES);
}

export async function listProgressOverviewModules(userId = DEMO_USER_ID): Promise<ProgressOverviewModuleConfig[]> {
  const db = await getDatabase();
  await ensureProgressOverviewModuleStorage(db);
  let rows = await db.getAllAsync<ProgressOverviewModuleRow>(
    `SELECT *
     FROM progress_overview_modules
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY position ASC, created_at ASC`,
    [userId],
  );

  if (!rows.length) {
    await replaceProgressOverviewModules(DEFAULT_PROGRESS_OVERVIEW_METRICS, userId);
    rows = await db.getAllAsync<ProgressOverviewModuleRow>(
      `SELECT *
       FROM progress_overview_modules
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY position ASC, created_at ASC`,
      [userId],
    );
  }

  return rows
    .filter(
      (row): row is ProgressOverviewModuleRow & { metric: ProgressOverviewMetric } =>
        isProgressOverviewMetric(row.metric),
    )
    .slice(0, MAX_PROGRESS_OVERVIEW_MODULES)
    .map((row) => ({
      id: row.id,
      metric: row.metric,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

export async function replaceProgressOverviewModules(
  metrics: ProgressOverviewMetric[],
  userId = DEMO_USER_ID,
): Promise<void> {
  const selectedMetrics = sanitizeOverviewMetrics(metrics);
  const db = await getDatabase();
  await ensureProgressOverviewModuleStorage(db);
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE progress_overview_modules
     SET deleted_at = ?, updated_at = ?, version = version + 1
     WHERE user_id = ? AND deleted_at IS NULL`,
    [now, now, userId],
  );

  for (const [position, metric] of selectedMetrics.entries()) {
    await db.runAsync(
      `INSERT INTO progress_overview_modules
       (id, user_id, metric, position, created_at, updated_at, deleted_at, sync_status, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [createId('ovm'), userId, metric, position, now, now, null, 'synced', 1],
    );
  }
}

async function ensureProgressOverviewModuleStorage(db: Awaited<ReturnType<typeof getDatabase>>): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS progress_overview_modules (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      metric TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT,
      sync_status TEXT NOT NULL DEFAULT 'synced',
      version INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_progress_overview_modules_user_position ON progress_overview_modules(user_id, position);
  `);
}

export async function listProgressWidgets(userId = DEMO_USER_ID): Promise<ProgressWidgetConfig[]> {
  const db = await getDatabase();
  let rows = await db.getAllAsync<ProgressWidgetRow>(
    `SELECT *
     FROM progress_widgets
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY position ASC, created_at ASC`,
    [userId],
  );

  if (!rows.length) {
    const now = new Date().toISOString();
    for (const [position, metric] of DEFAULT_WIDGET_METRICS.entries()) {
      const def = getMetricDefinition(metric);
      await db.runAsync(
        `INSERT INTO progress_widgets
        (id, user_id, type, metric, chart_type, time_range, exercise_id, unit, grouping, position, created_at, updated_at, deleted_at, sync_status, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId('widget'),
          userId,
          def.category,
          def.metric,
          def.defaultChartType,
          def.defaultTimeRange,
          null,
          def.defaultUnit,
          def.defaultGrouping,
          position,
          now,
          now,
          null,
          'synced',
          1,
        ],
      );
    }
    rows = await db.getAllAsync<ProgressWidgetRow>(
      `SELECT *
       FROM progress_widgets
       WHERE user_id = ? AND deleted_at IS NULL
       ORDER BY position ASC, created_at ASC`,
      [userId],
    );
  }

  return rows.map(mapWidget);
}

export async function getProgressWidget(id: string, userId = DEMO_USER_ID): Promise<ProgressWidgetConfig | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<ProgressWidgetRow>(
    `SELECT *
     FROM progress_widgets
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [id, userId],
  );
  return row ? mapWidget(row) : null;
}

export async function createProgressWidget(input: ProgressWidgetDraft, userId = DEMO_USER_ID): Promise<string> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ next_position: number }>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM progress_widgets WHERE user_id = ? AND deleted_at IS NULL',
    [userId],
  );
  const id = createId('widget');
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO progress_widgets
    (id, user_id, type, metric, chart_type, time_range, exercise_id, unit, grouping, position, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      input.type,
      input.metric,
      input.chartType,
      input.timeRange,
      input.exerciseId ?? null,
      input.unit ?? null,
      input.grouping ?? null,
      row?.next_position ?? 0,
      now,
      now,
      null,
      'synced',
      1,
    ],
  );
  return id;
}

export async function updateProgressWidget(
  id: string,
  patch: Partial<Pick<ProgressWidgetDraft, 'chartType' | 'timeRange' | 'exerciseId' | 'unit' | 'grouping'>>,
  userId = DEMO_USER_ID,
): Promise<void> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<ProgressWidgetRow>(
    'SELECT * FROM progress_widgets WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [id, userId],
  );
  if (!current) {
    throw new Error('Widget not found');
  }
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE progress_widgets
     SET chart_type = ?, time_range = ?, exercise_id = ?, unit = ?, grouping = ?, updated_at = ?, version = version + 1
     WHERE id = ? AND user_id = ?`,
    [
      patch.chartType ?? current.chart_type,
      patch.timeRange ?? current.time_range,
      patch.exerciseId ?? current.exercise_id,
      patch.unit ?? current.unit,
      patch.grouping ?? current.grouping,
      now,
      id,
      userId,
    ],
  );
}

export async function deleteProgressWidget(id: string, userId = DEMO_USER_ID): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE progress_widgets
     SET deleted_at = ?, updated_at = ?, version = version + 1
     WHERE id = ? AND user_id = ?`,
    [now, now, id, userId],
  );
}

export async function getProgressOverviewStats(
  range: ProgressWidgetTimeRange,
  userId = DEMO_USER_ID,
): Promise<ProgressOverviewStats> {
  const db = await getDatabase();
  const cutoff = cutoffForRange(range);
  const [goals, weightRows, workoutsRow, proteinRows, calorieRows] = await Promise.all([
    db.getFirstAsync<{ workouts_per_week_target: number; protein_target_g: number; calorie_target: number }>(
      `SELECT workouts_per_week_target, protein_target_g, calorie_target
       FROM goal_settings
       WHERE user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [userId],
    ),
    db.getAllAsync<{ logged_on: string; weight_kg: number }>(
      `SELECT logged_on, weight_kg
       FROM body_weight_logs
       WHERE user_id = ? AND deleted_at IS NULL ${cutoff ? 'AND logged_on >= ?' : ''}
       ORDER BY logged_on ASC`,
      cutoff ? [userId, cutoff] : [userId],
    ),
    db.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM workout_sessions
       WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL ${cutoff ? 'AND substr(started_at, 1, 10) >= ?' : ''}`,
      cutoff ? [userId, cutoff] : [userId],
    ),
    getDailyNutritionTotals('protein_g_snapshot * e.servings', cutoff, userId),
    getDailyNutritionTotals('calories_snapshot * e.servings', cutoff, userId),
  ]);

  const weightChangeKg =
    weightRows.length >= 2 ? round1(weightRows[weightRows.length - 1].weight_kg - weightRows[0].weight_kg) : undefined;
  const proteinAverageG = proteinRows.length
    ? Math.round(proteinRows.reduce((sum, item) => sum + item.value, 0) / proteinRows.length)
    : 0;
  const targetCalories = goals?.calorie_target ?? 0;
  const adherenceValues = calorieRows.map((row) => {
    if (targetCalories <= 0) return 0;
    const deviation = Math.abs(row.value - targetCalories) / targetCalories;
    return Math.max(0, 100 - deviation * 100);
  });
  const calorieAdherencePct = adherenceValues.length
    ? Math.round(adherenceValues.reduce((sum, value) => sum + value, 0) / adherenceValues.length)
    : 0;

  return {
    weightChangeKg,
    workoutsCompleted: workoutsRow?.count ?? 0,
    workoutsTarget: goals?.workouts_per_week_target ?? 0,
    proteinAverageG,
    proteinGoalG: Math.round(goals?.protein_target_g ?? 0),
    calorieAdherencePct,
    adherenceDays: adherenceValues.length,
  };
}

export async function getProgressWidgetSeries(
  config: Pick<ProgressWidgetDraft, 'metric' | 'grouping' | 'timeRange' | 'exerciseId'>,
  userId = DEMO_USER_ID,
): Promise<ProgressWidgetSeries> {
  const grouping = normalizeGrouping(config.metric, config.grouping ?? getMetricDefinition(config.metric).defaultGrouping);
  const cutoff = cutoffForRange(config.timeRange);
  const db = await getDatabase();

  if (config.metric === 'body_measurements') {
    const bucket = bucketExpr(grouping, 'measured_on');
    const rows = await db.getAllAsync<{ bucket: string; value: number }>(
      `SELECT ${bucket} AS bucket, AVG(value) AS value
       FROM body_measurements
       WHERE user_id = ? AND deleted_at IS NULL ${cutoff ? 'AND measured_on >= ?' : ''}
       GROUP BY bucket
       ORDER BY bucket ASC`,
      cutoff ? [userId, cutoff] : [userId],
    );
    const series = toSeries(rows, grouping);
    if (!series.points.length) {
      return { points: [], emptyMessage: 'No measurements logged yet.' };
    }
    return series;
  }
  if (config.metric === 'progress_photos') {
    return { points: [], emptyMessage: 'No progress photos logged yet.' };
  }
  if (
    (config.metric === 'best_set_over_time' ||
      config.metric === 'estimated_1rm' ||
      config.metric === 'volume_per_session') &&
    !config.exerciseId
  ) {
    return { points: [], emptyMessage: 'Select an exercise to render this statistic.' };
  }

  if (config.metric === 'body_weight') {
    const bucket = bucketExpr(grouping, 'logged_on');
    const rows = await db.getAllAsync<{ bucket: string; value: number }>(
      `SELECT ${bucket} AS bucket, AVG(weight_kg) AS value
       FROM body_weight_logs
       WHERE user_id = ? AND deleted_at IS NULL ${cutoff ? 'AND logged_on >= ?' : ''}
       GROUP BY bucket
       ORDER BY bucket ASC`,
      cutoff ? [userId, cutoff] : [userId],
    );
    return toSeries(rows, grouping);
  }

  if (config.metric === 'calories_over_time') {
    const rows = await getDailyNutritionTotals('calories_snapshot * e.servings', cutoff, userId);
    return toSeries(aggregateDaily(rows, grouping, 'sum'), grouping);
  }

  if (config.metric === 'protein_average') {
    const rows = await getDailyNutritionTotals('protein_g_snapshot * e.servings', cutoff, userId);
    return toSeries(aggregateDaily(rows, grouping, grouping === 'day' ? 'sum' : 'avg'), grouping);
  }

  if (config.metric === 'macro_split') {
    const row = await db.getFirstAsync<{ protein: number; carbs: number; fat: number }>(
      `SELECT
         COALESCE(SUM(e.protein_g_snapshot * e.servings), 0) AS protein,
         COALESCE(SUM(e.carbs_g_snapshot * e.servings), 0) AS carbs,
         COALESCE(SUM(e.fat_g_snapshot * e.servings), 0) AS fat
       FROM diary_entries e
       INNER JOIN diary_days d ON d.id = e.diary_day_id
       WHERE d.user_id = ? AND d.deleted_at IS NULL AND e.deleted_at IS NULL ${cutoff ? 'AND d.local_date >= ?' : ''}`,
      cutoff ? [userId, cutoff] : [userId],
    );
    const points: ProgressChartPoint[] = [
      { label: 'Protein', value: round1(row?.protein ?? 0) },
      { label: 'Carbs', value: round1(row?.carbs ?? 0) },
      { label: 'Fat', value: round1(row?.fat ?? 0) },
    ];
    return withSummary(points);
  }

  if (config.metric === 'calorie_adherence') {
    const [goalRow, caloriesByDay] = await Promise.all([
      db.getFirstAsync<{ calorie_target: number }>(
        `SELECT calorie_target
         FROM goal_settings
         WHERE user_id = ? AND deleted_at IS NULL
         LIMIT 1`,
        [userId],
      ),
      getDailyNutritionTotals('calories_snapshot * e.servings', cutoff, userId),
    ]);
    const target = goalRow?.calorie_target ?? 0;
    const adherenceRows = caloriesByDay.map((row) => ({
      day: row.day,
      value: target <= 0 ? 0 : Math.max(0, 100 - (Math.abs(row.value - target) / target) * 100),
    }));
    return toSeries(aggregateDaily(adherenceRows, grouping, grouping === 'day' ? 'sum' : 'avg'), grouping);
  }

  if (config.metric === 'workouts_per_week') {
    if (grouping === 'workout') {
      const rows = await db.getAllAsync<{ bucket: string; value: number }>(
        `SELECT substr(started_at, 1, 10) AS bucket, 1 AS value
         FROM workout_sessions
         WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL ${cutoff ? 'AND substr(started_at, 1, 10) >= ?' : ''}
         ORDER BY started_at ASC`,
        cutoff ? [userId, cutoff] : [userId],
      );
      return toSeries(rows, 'workout');
    }
    const bucket = bucketExpr(grouping, 'substr(started_at, 1, 10)');
    const rows = await db.getAllAsync<{ bucket: string; value: number }>(
      `SELECT ${bucket} AS bucket, COUNT(*) AS value
       FROM workout_sessions
       WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL ${cutoff ? 'AND substr(started_at, 1, 10) >= ?' : ''}
       GROUP BY bucket
       ORDER BY bucket ASC`,
      cutoff ? [userId, cutoff] : [userId],
    );
    return toSeries(rows, grouping);
  }

  if (config.metric === 'weekly_volume') {
    return toSeries(await querySetAggregateMetric('SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0))', grouping, cutoff, userId), grouping);
  }

  if (config.metric === 'training_duration') {
    if (grouping === 'workout') {
      const rows = await db.getAllAsync<{ bucket: string; value: number }>(
        `SELECT substr(started_at, 1, 10) AS bucket,
                (julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 24 * 60 AS value
         FROM workout_sessions
         WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL ${cutoff ? 'AND substr(started_at, 1, 10) >= ?' : ''}
         ORDER BY started_at ASC`,
        cutoff ? [userId, cutoff] : [userId],
      );
      return toSeries(rows, grouping);
    }
    const bucket = bucketExpr(grouping, 'substr(started_at, 1, 10)');
    const rows = await db.getAllAsync<{ bucket: string; value: number }>(
      `SELECT ${bucket} AS bucket,
              SUM((julianday(COALESCE(ended_at, started_at)) - julianday(started_at)) * 24 * 60) AS value
       FROM workout_sessions
       WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL ${cutoff ? 'AND substr(started_at, 1, 10) >= ?' : ''}
       GROUP BY bucket
       ORDER BY bucket ASC`,
      cutoff ? [userId, cutoff] : [userId],
    );
    return toSeries(rows, grouping);
  }

  if (config.metric === 'sets_per_week') {
    return toSeries(await querySetAggregateMetric('COUNT(s.id)', grouping, cutoff, userId), grouping);
  }

  if (config.metric === 'best_set_over_time') {
    return toSeries(await queryExerciseAggregateMetric(config.exerciseId!, 'MAX(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0))', grouping, cutoff, userId), grouping);
  }

  if (config.metric === 'estimated_1rm') {
    return toSeries(await queryExerciseAggregateMetric(config.exerciseId!, 'MAX(COALESCE(s.weight_kg, 0) * (1 + COALESCE(s.reps, 0) / 30.0))', grouping, cutoff, userId), grouping);
  }

  if (config.metric === 'volume_per_session') {
    return toSeries(await queryExerciseAggregateMetric(config.exerciseId!, 'SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0))', grouping, cutoff, userId), grouping);
  }

  return { points: [], emptyMessage: 'No data available.' };
}

function cutoffForRange(range: ProgressWidgetTimeRange): string | null {
  if (range === 'All') return null;
  const now = new Date();
  if (range === '7D') return format(subDays(now, 6), 'yyyy-MM-dd');
  if (range === '30D') return format(subDays(now, 29), 'yyyy-MM-dd');
  if (range === '90D') return format(subDays(now, 89), 'yyyy-MM-dd');
  return format(subYears(now, 1), 'yyyy-MM-dd');
}

function normalizeGrouping(metric: ProgressWidgetMetric, grouping: ProgressWidgetGrouping): ProgressWidgetGrouping {
  const workoutCapable: ProgressWidgetMetric[] = [
    'weekly_volume',
    'training_duration',
    'sets_per_week',
    'best_set_over_time',
    'estimated_1rm',
    'volume_per_session',
  ];
  if (grouping === 'workout' && !workoutCapable.includes(metric)) {
    return 'day';
  }
  return grouping;
}

function bucketExpr(grouping: ProgressWidgetGrouping, dateExpr: string): string {
  if (grouping === 'week') {
    return `strftime('%Y-W%W', ${dateExpr})`;
  }
  return dateExpr;
}

async function getDailyNutritionTotals(fieldExpr: string, cutoff: string | null, userId: string): Promise<Array<{ day: string; value: number }>> {
  const db = await getDatabase();
  return db.getAllAsync<{ day: string; value: number }>(
    `SELECT d.local_date AS day, COALESCE(SUM(${fieldExpr}), 0) AS value
     FROM diary_days d
     LEFT JOIN diary_entries e ON e.diary_day_id = d.id AND e.deleted_at IS NULL
     WHERE d.user_id = ? AND d.deleted_at IS NULL ${cutoff ? 'AND d.local_date >= ?' : ''}
     GROUP BY d.local_date
     ORDER BY d.local_date ASC`,
    cutoff ? [userId, cutoff] : [userId],
  );
}

type DailyValue = { day: string; value: number };

function aggregateDaily(
  rows: DailyValue[],
  grouping: ProgressWidgetGrouping,
  mode: 'sum' | 'avg',
): Array<{ bucket: string; value: number }> {
  if (grouping === 'workout') {
    return rows.map((row) => ({ bucket: row.day, value: row.value }));
  }
  if (grouping === 'day') {
    return rows.map((row) => ({ bucket: row.day, value: row.value }));
  }
  const grouped = new Map<string, number[]>();
  for (const row of rows) {
    const bucket = format(parseISO(`${row.day}T00:00:00`), "yyyy-'W'II");
    const current = grouped.get(bucket) ?? [];
    current.push(row.value);
    grouped.set(bucket, current);
  }
  return Array.from(grouped.entries())
    .map(([bucket, values]) => ({
      bucket,
      value: mode === 'avg' ? values.reduce((sum, value) => sum + value, 0) / values.length : values.reduce((sum, value) => sum + value, 0),
    }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

async function querySetAggregateMetric(
  aggregateExpr: string,
  grouping: ProgressWidgetGrouping,
  cutoff: string | null,
  userId: string,
): Promise<Array<{ bucket: string; value: number }>> {
  const db = await getDatabase();
  if (grouping === 'workout') {
    return db.getAllAsync<{ bucket: string; value: number }>(
      `SELECT substr(ws.started_at, 1, 10) AS bucket, ${aggregateExpr} AS value
       FROM workout_sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workout_sessions ws ON ws.id = we.workout_session_id
       WHERE ws.user_id = ? AND ws.status = 'completed' AND ws.deleted_at IS NULL AND s.is_completed = 1 AND s.deleted_at IS NULL
         ${cutoff ? 'AND substr(ws.started_at, 1, 10) >= ?' : ''}
       GROUP BY ws.id
       ORDER BY ws.started_at ASC`,
      cutoff ? [userId, cutoff] : [userId],
    );
  }
  const bucket = bucketExpr(grouping, 'substr(ws.started_at, 1, 10)');
  return db.getAllAsync<{ bucket: string; value: number }>(
    `SELECT ${bucket} AS bucket, ${aggregateExpr} AS value
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     WHERE ws.user_id = ? AND ws.status = 'completed' AND ws.deleted_at IS NULL AND s.is_completed = 1 AND s.deleted_at IS NULL
       ${cutoff ? 'AND substr(ws.started_at, 1, 10) >= ?' : ''}
     GROUP BY bucket
     ORDER BY bucket ASC`,
    cutoff ? [userId, cutoff] : [userId],
  );
}

async function queryExerciseAggregateMetric(
  exerciseId: string,
  aggregateExpr: string,
  grouping: ProgressWidgetGrouping,
  cutoff: string | null,
  userId: string,
): Promise<Array<{ bucket: string; value: number }>> {
  const db = await getDatabase();
  if (grouping === 'workout') {
    return db.getAllAsync<{ bucket: string; value: number }>(
      `SELECT substr(ws.started_at, 1, 10) AS bucket, ${aggregateExpr} AS value
       FROM workout_sets s
       JOIN workout_exercises we ON we.id = s.workout_exercise_id
       JOIN workout_sessions ws ON ws.id = we.workout_session_id
       WHERE ws.user_id = ? AND we.exercise_id = ? AND ws.status = 'completed' AND ws.deleted_at IS NULL
         AND s.is_completed = 1 AND s.deleted_at IS NULL
         ${cutoff ? 'AND substr(ws.started_at, 1, 10) >= ?' : ''}
       GROUP BY ws.id
       ORDER BY ws.started_at ASC`,
      cutoff ? [userId, exerciseId, cutoff] : [userId, exerciseId],
    );
  }
  const bucket = bucketExpr(grouping, 'substr(ws.started_at, 1, 10)');
  return db.getAllAsync<{ bucket: string; value: number }>(
    `SELECT ${bucket} AS bucket, ${aggregateExpr} AS value
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     WHERE ws.user_id = ? AND we.exercise_id = ? AND ws.status = 'completed' AND ws.deleted_at IS NULL
       AND s.is_completed = 1 AND s.deleted_at IS NULL
       ${cutoff ? 'AND substr(ws.started_at, 1, 10) >= ?' : ''}
     GROUP BY bucket
     ORDER BY bucket ASC`,
    cutoff ? [userId, exerciseId, cutoff] : [userId, exerciseId],
  );
}

function toSeries(rows: Array<{ bucket: string; value: number }>, grouping: ProgressWidgetGrouping): ProgressWidgetSeries {
  const points = rows.map((row) => ({
    label: formatLabel(row.bucket, grouping),
    value: round1(row.value ?? 0),
  }));
  return withSummary(points);
}

function withSummary(points: ProgressChartPoint[]): ProgressWidgetSeries {
  const latestValue = points.length ? points[points.length - 1].value : undefined;
  const changeFromStart = points.length > 1 ? round1(points[points.length - 1].value - points[0].value) : undefined;
  return {
    points,
    latestValue,
    changeFromStart,
    emptyMessage: points.length ? undefined : 'Log more data to see this chart.',
  };
}

function formatLabel(bucket: string, grouping: ProgressWidgetGrouping): string {
  if (grouping === 'week') {
    const week = bucket.includes('W') ? bucket.split('W')[1] : bucket;
    return `W${week}`;
  }
  if (bucket.length >= 10) {
    try {
      return format(parseISO(`${bucket.slice(0, 10)}T00:00:00`), 'd/M');
    } catch {
      return bucket.slice(5);
    }
  }
  return bucket;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mapWidget(row: ProgressWidgetRow): ProgressWidgetConfig {
  return {
    id: row.id,
    type: row.type,
    metric: row.metric,
    chartType: row.chart_type,
    timeRange: row.time_range,
    exerciseId: row.exercise_id ?? undefined,
    unit: row.unit ?? undefined,
    grouping: row.grouping ?? undefined,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
