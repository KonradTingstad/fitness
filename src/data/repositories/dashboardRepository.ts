import { getDatabase } from '@/data/db/database';
import { DEMO_USER_ID } from '@/data/db/ids';
import { getDiary } from '@/data/repositories/nutritionRepository';
import { getProfileBundle } from '@/data/repositories/settingsRepository';
import { getActiveWorkout } from '@/data/repositories/workoutRepository';
import { lastNDays, toLocalDateKey } from '@/domain/calculations/dates';
import { DashboardSummary } from '@/domain/models';

export async function getDashboardSummary(userId = DEMO_USER_ID): Promise<DashboardSummary> {
  const db = await getDatabase();
  const localDate = toLocalDateKey();
  const [{ profile, settings, units, goals }, diary, activeWorkout, userRow] = await Promise.all([
    getProfileBundle(userId),
    getDiary(localDate, userId),
    getActiveWorkout(userId),
    db.getFirstAsync<{ display_name: string | null }>(
      `SELECT display_name
       FROM users
       WHERE id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [userId],
    ),
  ]);
  const weekDates = lastNDays(7);
  const weekStart = `${weekDates[0]}T00:00:00.000Z`;
  const weekWorkoutRow = await db.getFirstAsync<{ count: number }>(
    `SELECT COUNT(*) as count
     FROM workout_sessions
     WHERE user_id = ? AND status = 'completed' AND started_at >= ? AND deleted_at IS NULL`,
    [userId, weekStart],
  );

  let averageCalories = 0;
  let averageProteinG = 0;
  for (const date of weekDates) {
    const daily = await getDiary(date, userId);
    averageCalories += daily.totals.calories;
    averageProteinG += daily.totals.proteinG;
  }
  averageCalories = Math.round(averageCalories / weekDates.length);
  averageProteinG = Math.round(averageProteinG / weekDates.length);

  const latestWeightRow = await db.getFirstAsync<{
    id: string;
    user_id: string;
    logged_on: string;
    weight_kg: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    sync_status: DashboardSummary['latestWeight'] extends infer T ? 'synced' | 'pending' | 'failed' : never;
    version: number;
  }>(
    `SELECT * FROM body_weight_logs
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY logged_on DESC LIMIT 1`,
    [userId],
  );

  const workoutToday = await db.getFirstAsync<{ status: 'completed' }>(
    `SELECT status FROM workout_sessions
     WHERE user_id = ? AND status = 'completed' AND substr(started_at, 1, 10) = ?
     ORDER BY started_at DESC LIMIT 1`,
    [userId, localDate],
  );
  const todayPlanRow = await db.getFirstAsync<{
    id: string;
    routine_id: string;
    workout_name: string;
    scheduled_time: string | null;
    estimated_duration_minutes: number | null;
    exercise_count: number;
  }>(
    `SELECT wp.id, wp.routine_id, r.name AS workout_name, wp.scheduled_time, wp.estimated_duration_minutes,
            COUNT(re.id) AS exercise_count
     FROM workout_plans wp
     INNER JOIN routines r ON r.id = wp.routine_id AND r.deleted_at IS NULL
     LEFT JOIN routine_exercises re ON re.routine_id = r.id AND re.deleted_at IS NULL
     WHERE wp.user_id = ? AND wp.local_date = ? AND wp.deleted_at IS NULL
     GROUP BY wp.id, wp.routine_id, r.name, wp.scheduled_time, wp.estimated_duration_minutes
     ORDER BY CASE WHEN wp.scheduled_time IS NULL THEN 1 ELSE 0 END, wp.scheduled_time ASC, wp.created_at ASC
     LIMIT 1`,
    [userId, localDate],
  );

  const completedPlanSession = todayPlanRow
    ? await db.getFirstAsync<{ id: string }>(
        `SELECT id
         FROM workout_sessions
         WHERE user_id = ? AND status = 'completed' AND routine_id = ? AND deleted_at IS NULL AND substr(started_at, 1, 10) = ?
         ORDER BY started_at DESC LIMIT 1`,
        [userId, todayPlanRow.routine_id, localDate],
      )
    : null;

  const proteinRemaining = goals.proteinTargetG - diary.totals.proteinG;
  const caloriesRemaining = goals.calorieTarget - diary.totals.calories;
  let insight: string | undefined;
  if (workoutToday && proteinRemaining > 25) {
    insight = `You trained today. ${Math.round(proteinRemaining)} g protein keeps recovery on track.`;
  } else if (caloriesRemaining > 0 && caloriesRemaining < 250) {
    insight = 'You are close to your calorie target. Keep the next log precise.';
  } else if (!activeWorkout && (weekWorkoutRow?.count ?? 0) < goals.workoutsPerWeekTarget) {
    insight = 'Upper Strength is queued as a useful next workout.';
  }
  const activePlanSession =
    activeWorkout && activeWorkout.startedAt.slice(0, 10) === localDate && activeWorkout.routineId === todayPlanRow?.routine_id
      ? activeWorkout
      : null;
  const exerciseCount = todayPlanRow?.exercise_count ?? 0;
  const estimatedDurationMinutes = todayPlanRow
    ? todayPlanRow.estimated_duration_minutes ?? Math.max(30, exerciseCount * 12)
    : 0;
  const todayPlan = todayPlanRow
    ? activePlanSession
      ? {
          id: todayPlanRow.id,
          routineId: todayPlanRow.routine_id,
          workoutName: todayPlanRow.workout_name,
          time: todayPlanRow.scheduled_time,
          exerciseCount,
          estimatedDurationMinutes,
          action: 'view_workout' as const,
          sessionId: activePlanSession.id,
        }
      : completedPlanSession
        ? {
            id: todayPlanRow.id,
            routineId: todayPlanRow.routine_id,
            workoutName: todayPlanRow.workout_name,
            time: todayPlanRow.scheduled_time,
            exerciseCount,
            estimatedDurationMinutes,
            action: 'view_summary' as const,
            sessionId: completedPlanSession.id,
          }
        : {
            id: todayPlanRow.id,
            routineId: todayPlanRow.routine_id,
            workoutName: todayPlanRow.workout_name,
            time: todayPlanRow.scheduled_time,
            exerciseCount,
            estimatedDurationMinutes,
            action: 'start' as const,
          }
    : null;

  return {
    userDisplayName: userRow?.display_name ?? null,
    profile,
    settings,
    units,
    goals,
    today: {
      localDate,
      nutrition: diary.totals,
      waterMl: diary.day.waterMl,
      workoutStatus: activeWorkout ? 'active' : workoutToday ? 'completed' : 'none',
    },
    weekly: {
      workoutsCompleted: weekWorkoutRow?.count ?? 0,
      averageCalories,
      averageProteinG,
    },
    todayPlan,
    latestWeight: latestWeightRow
      ? {
          id: latestWeightRow.id,
          userId: latestWeightRow.user_id,
          loggedOn: latestWeightRow.logged_on,
          weightKg: latestWeightRow.weight_kg,
          notes: latestWeightRow.notes,
          createdAt: latestWeightRow.created_at,
          updatedAt: latestWeightRow.updated_at,
          deletedAt: latestWeightRow.deleted_at,
          syncStatus: latestWeightRow.sync_status,
          version: latestWeightRow.version,
        }
      : null,
    insight,
  };
}

export async function getBodyWeightTrend(userId = DEMO_USER_ID): Promise<Array<{ label: string; value: number }>> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ logged_on: string; weight_kg: number }>(
    `SELECT logged_on, weight_kg
     FROM body_weight_logs
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY logged_on ASC LIMIT 30`,
    [userId],
  );
  return rows.map((row) => ({
    label: row.logged_on.slice(5),
    value: row.weight_kg,
  }));
}
