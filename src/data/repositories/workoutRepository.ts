import { getDatabase } from '@/data/db/database';
import { createId, DEMO_USER_ID } from '@/data/db/ids';
import { enqueueSync } from '@/data/sync/syncQueue';
import { shiftLocalDate } from '@/domain/calculations/dates';
import { calculateSetVolume, estimatedOneRepMax, generateWorkoutTitleForTimeOfDay } from '@/domain/calculations/workout';
import {
  Exercise,
  Routine,
  RoutineExercise,
  RoutineExerciseSetTemplate,
  SetType,
  WorkoutExercise,
  WorkoutSession,
  WorkoutSet,
} from '@/domain/models';

type ExerciseRow = {
  id: string;
  user_id: string | null;
  name: string;
  primary_muscle: string;
  equipment: string;
  instructions: string | null;
  is_custom: number;
};

type RoutineRow = {
  id: string;
  user_id: string;
  name: string;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: Routine['syncStatus'];
  version: number;
};

type RoutineExerciseRow = {
  id: string;
  routine_id: string;
  exercise_id: string;
  sort_order: number;
  superset_group: string | null;
  notes: string | null;
  default_rest_seconds: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: RoutineExercise['syncStatus'];
  version: number;
};

type RoutineSetRow = {
  id: string;
  routine_exercise_id: string;
  sort_order: number;
  set_type: SetType;
  target_reps_min: number | null;
  target_reps_max: number | null;
  target_weight_kg: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: RoutineExerciseSetTemplate['syncStatus'];
  version: number;
};

type WorkoutSessionRow = {
  id: string;
  user_id: string;
  routine_id: string | null;
  title: string;
  started_at: string;
  ended_at: string | null;
  status: WorkoutSession['status'];
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: WorkoutSession['syncStatus'];
  version: number;
};

type WorkoutPlanRow = {
  id: string;
  routine_id: string;
  workout_name: string;
  local_date: string;
  scheduled_time: string | null;
  estimated_duration_minutes: number | null;
  exercise_count: number;
};

type WorkoutProgramDayRow = {
  id: string;
  local_date: string;
  activity_type: ProgramActivityType;
  title: string;
  routine_id: string | null;
  estimated_duration_minutes: number | null;
  metadata: string | null;
  workout_name: string | null;
  exercise_count: number | null;
};

type RoutineSummaryRow = {
  id: string;
  name: string;
  exercise_count: number;
};

type WorkoutExerciseRow = {
  id: string;
  workout_session_id: string;
  exercise_id: string;
  sort_order: number;
  superset_group: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: WorkoutExercise['syncStatus'];
  version: number;
};

type WorkoutSetRow = {
  id: string;
  workout_exercise_id: string;
  sort_order: number;
  set_type: SetType;
  weight_kg: number | null;
  reps: number | null;
  duration_seconds: number | null;
  distance_meters: number | null;
  rpe: number | null;
  rir: number | null;
  is_completed: number;
  completed_at: string | null;
  previous_weight_kg: number | null;
  previous_reps: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: WorkoutSet['syncStatus'];
  version: number;
};

export interface WorkoutSummary {
  session: WorkoutSession;
  totalSets: number;
  completedSets: number;
  totalReps: number;
  totalVolumeKg: number;
  durationSeconds: number;
  prs: Array<{ label: string; value: string }>;
}

export interface WorkoutPlanItem {
  id: string;
  routineId: string;
  workoutName: string;
  localDate: string;
  scheduledTime?: string | null;
  estimatedDurationMinutes: number;
  exerciseCount: number;
}

export type ProgramActivityType = 'strength' | 'cardio' | 'padel' | 'golf' | 'rest' | 'recovery';

export interface ProgramScheduleDay {
  id: string;
  localDate: string;
  activityType: ProgramActivityType;
  title: string;
  subtitle: string;
  routineId?: string | null;
  estimatedDurationMinutes: number;
  exerciseCount: number;
  source: 'custom' | 'default';
}

export interface UpsertProgramScheduleDayInput {
  localDate: string;
  activityType: ProgramActivityType;
  title: string;
  subtitle?: string | null;
  routineId?: string | null;
  estimatedDurationMinutes?: number | null;
}

const PROGRAM_ACTIVITY_DETAILS: Record<Exclude<ProgramActivityType, 'strength'>, { title: string; subtitle: string; estimatedDurationMinutes: number }> = {
  cardio: { title: 'Cardio', subtitle: 'Moderate · ~35 min', estimatedDurationMinutes: 35 },
  padel: { title: 'Padel', subtitle: 'Match / Training', estimatedDurationMinutes: 60 },
  golf: { title: 'Golf', subtitle: '18 holes / Practice', estimatedDurationMinutes: 120 },
  rest: { title: 'Rest day', subtitle: 'Recovery', estimatedDurationMinutes: 0 },
  recovery: { title: 'Active recovery', subtitle: 'Mobility / Light walk', estimatedDurationMinutes: 30 },
};

export async function listExercises(userId = DEMO_USER_ID): Promise<Exercise[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT * FROM exercises
     WHERE deleted_at IS NULL AND (user_id IS NULL OR user_id = ?)
     ORDER BY is_custom DESC, name ASC`,
    [userId],
  );
  return rows.map(mapExercise);
}

export async function listRoutines(userId = DEMO_USER_ID): Promise<Routine[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<RoutineRow>(
    'SELECT * FROM routines WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC',
    [userId],
  );
  const routines: Routine[] = [];
  for (const row of rows) {
    routines.push(await hydrateRoutine(row));
  }
  return routines;
}

export async function getActiveWorkout(userId = DEMO_USER_ID): Promise<WorkoutSession | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<WorkoutSessionRow>(
    "SELECT * FROM workout_sessions WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
    [userId],
  );
  return row ? hydrateWorkoutSession(row) : null;
}

export async function getWorkoutSession(id: string): Promise<WorkoutSession> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<WorkoutSessionRow>('SELECT * FROM workout_sessions WHERE id = ?', [id]);
  if (!row) {
    throw new Error('Workout not found');
  }
  return hydrateWorkoutSession(row);
}

export async function getRecentWorkouts(userId = DEMO_USER_ID, limit = 10): Promise<WorkoutSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WorkoutSessionRow>(
    `SELECT * FROM workout_sessions
     WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL
     ORDER BY started_at DESC LIMIT ?`,
    [userId, limit],
  );
  const sessions: WorkoutSession[] = [];
  for (const row of rows) {
    sessions.push(await hydrateWorkoutSession(row));
  }
  return sessions;
}

export async function listWorkoutSessionsForRange(
  startLocalDate: string,
  endLocalDate: string,
  userId = DEMO_USER_ID,
): Promise<WorkoutSession[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WorkoutSessionRow>(
    `SELECT * FROM workout_sessions
     WHERE user_id = ?
       AND status IN ('active', 'completed')
       AND deleted_at IS NULL
       AND substr(started_at, 1, 10) BETWEEN ? AND ?
     ORDER BY started_at DESC`,
    [userId, startLocalDate, endLocalDate],
  );
  const sessions: WorkoutSession[] = [];
  for (const row of rows) {
    sessions.push(await hydrateWorkoutSession(row));
  }
  return sessions;
}

export async function listWorkoutPlansForRange(
  startLocalDate: string,
  endLocalDate: string,
  userId = DEMO_USER_ID,
): Promise<WorkoutPlanItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<WorkoutPlanRow>(
    `SELECT wp.id, wp.routine_id, r.name AS workout_name, wp.local_date, wp.scheduled_time,
            wp.estimated_duration_minutes, COUNT(re.id) AS exercise_count
     FROM workout_plans wp
     INNER JOIN routines r ON r.id = wp.routine_id AND r.deleted_at IS NULL
     LEFT JOIN routine_exercises re ON re.routine_id = r.id AND re.deleted_at IS NULL
     WHERE wp.user_id = ?
       AND wp.local_date BETWEEN ? AND ?
       AND wp.deleted_at IS NULL
     GROUP BY wp.id, wp.routine_id, r.name, wp.local_date, wp.scheduled_time, wp.estimated_duration_minutes
     ORDER BY wp.local_date ASC, CASE WHEN wp.scheduled_time IS NULL THEN 1 ELSE 0 END, wp.scheduled_time ASC`,
    [userId, startLocalDate, endLocalDate],
  );
  return rows.map((row) => ({
    id: row.id,
    routineId: row.routine_id,
    workoutName: row.workout_name,
    localDate: row.local_date,
    scheduledTime: row.scheduled_time,
    exerciseCount: row.exercise_count,
    estimatedDurationMinutes: row.estimated_duration_minutes ?? Math.max(30, row.exercise_count * 12),
  }));
}

export async function listProgramScheduleForRange(
  startLocalDate: string,
  endLocalDate: string,
  userId = DEMO_USER_ID,
): Promise<ProgramScheduleDay[]> {
  const db = await getDatabase();
  const [customRows, routineRows] = await Promise.all([
    db.getAllAsync<WorkoutProgramDayRow>(
      `SELECT pd.id, pd.local_date, pd.activity_type, pd.title, pd.routine_id, pd.estimated_duration_minutes,
              pd.metadata, r.name AS workout_name, COUNT(re.id) AS exercise_count
       FROM workout_program_days pd
       LEFT JOIN routines r ON r.id = pd.routine_id AND r.deleted_at IS NULL
       LEFT JOIN routine_exercises re ON re.routine_id = r.id AND re.deleted_at IS NULL
       WHERE pd.user_id = ?
         AND pd.local_date BETWEEN ? AND ?
         AND pd.deleted_at IS NULL
       GROUP BY pd.id, pd.local_date, pd.activity_type, pd.title, pd.routine_id, pd.estimated_duration_minutes, pd.metadata, r.name
       ORDER BY pd.local_date ASC`,
      [userId, startLocalDate, endLocalDate],
    ),
    db.getAllAsync<RoutineSummaryRow>(
      `SELECT r.id, r.name, COUNT(re.id) AS exercise_count
       FROM routines r
       LEFT JOIN routine_exercises re ON re.routine_id = r.id AND re.deleted_at IS NULL
       WHERE r.user_id = ? AND r.deleted_at IS NULL
       GROUP BY r.id, r.name
       ORDER BY r.sort_order ASC, r.name ASC`,
      [userId],
    ),
  ]);

  const customByDate = new Map(customRows.map((row) => [row.local_date, row]));
  const localDates = localDatesBetween(startLocalDate, endLocalDate);

  return localDates.map((localDate) => {
    const custom = customByDate.get(localDate);
    if (custom) {
      return mapProgramScheduleRow(custom);
    }
    return buildDefaultProgramScheduleDay(localDate, routineRows);
  });
}

export async function upsertProgramScheduleDay(
  input: UpsertProgramScheduleDayInput,
  userId = DEMO_USER_ID,
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM workout_program_days WHERE user_id = ? AND local_date = ? LIMIT 1',
    [userId, input.localDate],
  );

  const metadata = input.subtitle?.trim() || null;
  const routineId = input.activityType === 'strength' ? input.routineId ?? null : null;
  const estimatedDurationMinutes = Math.max(0, Math.round(input.estimatedDurationMinutes ?? 0));

  if (existing?.id) {
    await db.runAsync(
      `UPDATE workout_program_days
       SET activity_type = ?, title = ?, routine_id = ?, estimated_duration_minutes = ?, metadata = ?,
           updated_at = ?, deleted_at = NULL, sync_status = 'pending', version = version + 1
       WHERE id = ?`,
      [input.activityType, input.title, routineId, estimatedDurationMinutes, metadata, now, existing.id],
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO workout_program_days
    (id, user_id, local_date, activity_type, title, routine_id, estimated_duration_minutes, metadata, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      createId('program_day'),
      userId,
      input.localDate,
      input.activityType,
      input.title,
      routineId,
      estimatedDurationMinutes,
      metadata,
      now,
      now,
      null,
      'pending',
      1,
    ],
  );
}

export async function startWorkoutFromRoutine(routineId: string, userId = DEMO_USER_ID): Promise<string> {
  const db = await getDatabase();
  const existingActive = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workout_sessions WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
    [userId],
  );
  if (existingActive?.id) {
    return existingActive.id;
  }
  const routine = await db.getFirstAsync<RoutineRow>('SELECT * FROM routines WHERE id = ?', [routineId]);
  if (!routine) {
    throw new Error('Routine not found');
  }
  const now = new Date().toISOString();
  const sessionId = createId('workout');
  await db.runAsync(
    `INSERT INTO workout_sessions
    (id, user_id, routine_id, title, started_at, ended_at, status, notes, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, routineId, routine.name, now, null, 'active', routine.notes, now, now, null, 'pending', 1],
  );

  const routineExercises = await db.getAllAsync<RoutineExerciseRow>(
    'SELECT * FROM routine_exercises WHERE routine_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC',
    [routineId],
  );
  for (const routineExercise of routineExercises) {
    const workoutExerciseId = createId('workout_exercise');
    await db.runAsync(
      `INSERT INTO workout_exercises
      (id, workout_session_id, exercise_id, sort_order, superset_group, notes, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workoutExerciseId,
        sessionId,
        routineExercise.exercise_id,
        routineExercise.sort_order,
        routineExercise.superset_group,
        routineExercise.notes,
        now,
        now,
        null,
        'pending',
        1,
      ],
    );
    const templates = await db.getAllAsync<RoutineSetRow>(
      'SELECT * FROM routine_exercise_set_templates WHERE routine_exercise_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC',
      [routineExercise.id],
    );
    for (const template of templates) {
      const previous = await getPreviousPerformance(routineExercise.exercise_id, template.sort_order);
      await db.runAsync(
        `INSERT INTO workout_sets
        (id, workout_exercise_id, sort_order, set_type, weight_kg, reps, duration_seconds, distance_meters, rpe, rir, is_completed, completed_at, previous_weight_kg, previous_reps, created_at, updated_at, deleted_at, sync_status, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId('set'),
          workoutExerciseId,
          template.sort_order,
          template.set_type,
          template.target_weight_kg,
          template.target_reps_max ?? template.target_reps_min,
          template.duration_seconds,
          template.distance_meters,
          null,
          null,
          0,
          null,
          previous?.weight_kg ?? null,
          previous?.reps ?? null,
          now,
          now,
          null,
          'pending',
          1,
        ],
      );
    }
  }
  await enqueueSync('workout_session', sessionId, 'insert', { routineId, startedAt: now });
  return sessionId;
}

export async function startEmptyWorkout(userId = DEMO_USER_ID): Promise<string> {
  const db = await getDatabase();
  const existingActive = await db.getFirstAsync<{ id: string }>(
    "SELECT id FROM workout_sessions WHERE user_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY started_at DESC LIMIT 1",
    [userId],
  );
  if (existingActive?.id) {
    return existingActive.id;
  }
  const now = new Date().toISOString();
  const sessionId = createId('workout');
  const title = generateWorkoutTitleForTimeOfDay(new Date(now));
  await db.runAsync(
    `INSERT INTO workout_sessions
    (id, user_id, routine_id, title, started_at, ended_at, status, notes, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, null, title, now, null, 'active', null, now, now, null, 'pending', 1],
  );
  await enqueueSync('workout_session', sessionId, 'insert', { startedAt: now });
  return sessionId;
}

export async function addExerciseToWorkout(sessionId: string, exerciseId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const row = await db.getFirstAsync<{ next_order: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM workout_exercises WHERE workout_session_id = ?',
    [sessionId],
  );
  const workoutExerciseId = createId('workout_exercise');
  await db.runAsync(
    `INSERT INTO workout_exercises
    (id, workout_session_id, exercise_id, sort_order, superset_group, notes, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [workoutExerciseId, sessionId, exerciseId, row?.next_order ?? 1, null, null, now, now, null, 'pending', 1],
  );
  await addSet(workoutExerciseId, 'normal');
  await enqueueSync('workout_exercise', workoutExerciseId, 'insert', { sessionId, exerciseId });
}

export async function removeExerciseFromWorkout(workoutExerciseId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const exerciseRow = await db.getFirstAsync<WorkoutExerciseRow>(
    'SELECT * FROM workout_exercises WHERE id = ? AND deleted_at IS NULL',
    [workoutExerciseId],
  );
  if (!exerciseRow) {
    throw new Error('Exercise entry not found');
  }
  const setRows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM workout_sets WHERE workout_exercise_id = ? AND deleted_at IS NULL',
    [workoutExerciseId],
  );
  await db.runAsync(
    `UPDATE workout_sets
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE workout_exercise_id = ? AND deleted_at IS NULL`,
    [now, now, workoutExerciseId],
  );
  await db.runAsync(
    `UPDATE workout_exercises
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ? AND deleted_at IS NULL`,
    [now, now, workoutExerciseId],
  );
  for (const setRow of setRows) {
    await enqueueSync('workout_set', setRow.id, 'delete', { id: setRow.id, workoutExerciseId });
  }
  await enqueueSync('workout_exercise', workoutExerciseId, 'delete', {
    id: workoutExerciseId,
    workoutSessionId: exerciseRow.workout_session_id,
  });
}

export async function addSet(workoutExerciseId: string, setType: SetType = 'normal'): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const next = await db.getFirstAsync<{ next_order: number }>(
    'SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM workout_sets WHERE workout_exercise_id = ?',
    [workoutExerciseId],
  );
  const id = createId('set');
  await db.runAsync(
    `INSERT INTO workout_sets
    (id, workout_exercise_id, sort_order, set_type, weight_kg, reps, duration_seconds, distance_meters, rpe, rir, is_completed, completed_at, previous_weight_kg, previous_reps, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, workoutExerciseId, next?.next_order ?? 1, setType, null, null, null, null, null, null, 0, null, null, null, now, now, null, 'pending', 1],
  );
  await enqueueSync('workout_set', id, 'insert', { workoutExerciseId, setType });
}

export async function updateWorkoutSet(
  setId: string,
  patch: Partial<Pick<WorkoutSet, 'weightKg' | 'reps' | 'setType' | 'rpe' | 'rir' | 'durationSeconds' | 'distanceMeters'>>,
): Promise<void> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<WorkoutSetRow>('SELECT * FROM workout_sets WHERE id = ?', [setId]);
  if (!current) {
    throw new Error('Set not found');
  }
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE workout_sets
     SET weight_kg = ?, reps = ?, set_type = ?, rpe = ?, rir = ?, duration_seconds = ?, distance_meters = ?,
         updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ?`,
    [
      patch.weightKg ?? current.weight_kg,
      patch.reps ?? current.reps,
      patch.setType ?? current.set_type,
      patch.rpe ?? current.rpe,
      patch.rir ?? current.rir,
      patch.durationSeconds ?? current.duration_seconds,
      patch.distanceMeters ?? current.distance_meters,
      now,
      setId,
    ],
  );
  await enqueueSync('workout_set', setId, 'update', patch);
}

export async function completeWorkoutSet(setId: string): Promise<number> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<WorkoutSetRow>('SELECT * FROM workout_sets WHERE id = ?', [setId]);
  if (!current) {
    throw new Error('Set not found');
  }
  const now = new Date().toISOString();
  const nextCompleted = current.is_completed ? 0 : 1;
  await db.runAsync(
    `UPDATE workout_sets
     SET is_completed = ?, completed_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ?`,
    [nextCompleted, nextCompleted ? now : null, now, setId],
  );
  await enqueueSync('workout_set', setId, 'update', { isCompleted: Boolean(nextCompleted), completedAt: nextCompleted ? now : null });
  return nextCompleted ? 120 : 0;
}

export async function finishWorkout(sessionId: string): Promise<WorkoutSummary> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE workout_sessions
     SET status = 'completed', ended_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ?`,
    [now, now, sessionId],
  );
  await enqueueSync('workout_session', sessionId, 'update', { status: 'completed', endedAt: now });
  const summary = await getWorkoutSummary(sessionId);
  await persistPRs(summary.session);
  return summary;
}

export async function discardWorkout(sessionId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE workout_sessions
     SET status = 'discarded', deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ?`,
    [now, now, sessionId],
  );
  await enqueueSync('workout_session', sessionId, 'delete', { id: sessionId });
}

export async function applyWorkoutSessionToRoutine(sessionId: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const sessionRow = await db.getFirstAsync<WorkoutSessionRow>('SELECT * FROM workout_sessions WHERE id = ?', [sessionId]);

  if (!sessionRow) {
    throw new Error('Workout not found');
  }
  if (!sessionRow.routine_id) {
    throw new Error('Workout has no linked routine');
  }

  const routineId = sessionRow.routine_id;
  const workout = await getWorkoutSession(sessionId);
  const existingRoutineExercises = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM routine_exercises WHERE routine_id = ? AND deleted_at IS NULL',
    [routineId],
  );

  for (const row of existingRoutineExercises) {
    await db.runAsync(
      `UPDATE routine_exercise_set_templates
       SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
       WHERE routine_exercise_id = ? AND deleted_at IS NULL`,
      [now, now, row.id],
    );
  }

  await db.runAsync(
    `UPDATE routine_exercises
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE routine_id = ? AND deleted_at IS NULL`,
    [now, now, routineId],
  );

  for (const [exerciseIndex, exercise] of workout.exercises.entries()) {
    const routineExerciseId = createId('routine_exercise');
    await db.runAsync(
      `INSERT INTO routine_exercises
      (id, routine_id, exercise_id, sort_order, superset_group, notes, default_rest_seconds, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        routineExerciseId,
        routineId,
        exercise.exerciseId,
        exerciseIndex + 1,
        exercise.supersetGroup ?? null,
        exercise.notes ?? null,
        120,
        now,
        now,
        null,
        'pending',
        1,
      ],
    );

    for (const [setIndex, set] of exercise.sets.entries()) {
      const targetReps = set.reps ?? null;
      await db.runAsync(
        `INSERT INTO routine_exercise_set_templates
        (id, routine_exercise_id, sort_order, set_type, target_reps_min, target_reps_max, target_weight_kg, duration_seconds, distance_meters, created_at, updated_at, deleted_at, sync_status, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          createId('routine_set_template'),
          routineExerciseId,
          setIndex + 1,
          set.setType,
          targetReps,
          targetReps,
          set.weightKg ?? null,
          set.durationSeconds ?? null,
          set.distanceMeters ?? null,
          now,
          now,
          null,
          'pending',
          1,
        ],
      );
    }
  }

  await db.runAsync(
    `UPDATE routines
     SET updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ?`,
    [now, routineId],
  );
}

export async function getWorkoutSummary(sessionId: string): Promise<WorkoutSummary> {
  const session = await getWorkoutSession(sessionId);
  const sets = session.exercises.flatMap((exercise) => exercise.sets);
  const completed = sets.filter((set) => set.isCompleted);
  const durationSeconds = Math.max(
    0,
    Math.round(((session.endedAt ? new Date(session.endedAt) : new Date()).getTime() - new Date(session.startedAt).getTime()) / 1000),
  );
  const totalVolumeKg = calculateSetVolumeAggregate(completed);
  return {
    session,
    totalSets: sets.length,
    completedSets: completed.length,
    totalReps: completed.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    totalVolumeKg,
    durationSeconds,
    prs: completed
      .filter((set) => (set.weightKg ?? 0) > (set.previousWeightKg ?? 0) && (set.reps ?? 0) >= (set.previousReps ?? 0))
      .map((set) => ({ label: 'Session PR', value: `${set.weightKg ?? 0} kg x ${set.reps ?? 0}` })),
  };
}

export async function getExerciseHistory(exerciseId: string): Promise<{
  exercise: Exercise;
  sets: WorkoutSet[];
  bestSet?: WorkoutSet;
  volumeBySession: Array<{ label: string; value: number }>;
}> {
  const db = await getDatabase();
  const exerciseRow = await db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', [exerciseId]);
  if (!exerciseRow) {
    throw new Error('Exercise not found');
  }
  const setRows = await db.getAllAsync<WorkoutSetRow>(
    `SELECT s.*
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     WHERE we.exercise_id = ? AND ws.status = 'completed' AND s.is_completed = 1 AND s.deleted_at IS NULL
     ORDER BY s.completed_at DESC
     LIMIT 50`,
    [exerciseId],
  );
  const sets = setRows.map(mapWorkoutSet);
  const bestSet = sets.reduce<WorkoutSet | undefined>((best, set) => {
    if (!best) {
      return set;
    }
    return estimatedOneRepMax(set.weightKg ?? 0, set.reps ?? 0) > estimatedOneRepMax(best.weightKg ?? 0, best.reps ?? 0) ? set : best;
  }, undefined);
  const volumeRows = await db.getAllAsync<{ started_at: string; volume: number }>(
    `SELECT ws.started_at, SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0)) as volume
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     WHERE we.exercise_id = ? AND ws.status = 'completed' AND s.is_completed = 1
     GROUP BY ws.id
     ORDER BY ws.started_at ASC
     LIMIT 8`,
    [exerciseId],
  );
  return {
    exercise: mapExercise(exerciseRow),
    sets,
    bestSet,
    volumeBySession: volumeRows.map((row) => ({
      label: new Date(row.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      value: row.volume,
    })),
  };
}

export async function getWorkoutProgress(userId = DEMO_USER_ID): Promise<{
  completedByWeek: Array<{ label: string; value: number }>;
  volumeByWeek: Array<{ label: string; value: number }>;
  muscleDistribution: Array<{ label: string; value: number }>;
}> {
  const db = await getDatabase();
  const completedByWeek = await db.getAllAsync<{ label: string; value: number }>(
    `SELECT strftime('%W', started_at) as label, COUNT(*) as value
     FROM workout_sessions
     WHERE user_id = ? AND status = 'completed' AND deleted_at IS NULL
     GROUP BY strftime('%W', started_at)
     ORDER BY started_at ASC
     LIMIT 8`,
    [userId],
  );
  const volumeByWeek = await db.getAllAsync<{ label: string; value: number }>(
    `SELECT strftime('%W', ws.started_at) as label, SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0)) as value
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     WHERE ws.user_id = ? AND ws.status = 'completed' AND s.is_completed = 1
     GROUP BY strftime('%W', ws.started_at)
     ORDER BY ws.started_at ASC
     LIMIT 8`,
    [userId],
  );
  const muscleDistribution = await db.getAllAsync<{ label: string; value: number }>(
    `SELECT e.primary_muscle as label, COUNT(*) as value
     FROM workout_exercises we
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     JOIN exercises e ON e.id = we.exercise_id
     WHERE ws.user_id = ? AND ws.status = 'completed'
     GROUP BY e.primary_muscle
     ORDER BY value DESC
     LIMIT 6`,
    [userId],
  );
  return { completedByWeek, volumeByWeek, muscleDistribution };
}

function localDatesBetween(startLocalDate: string, endLocalDate: string): string[] {
  const dates: string[] = [];
  let cursor = startLocalDate;
  while (cursor <= endLocalDate) {
    dates.push(cursor);
    cursor = shiftLocalDate(cursor, 1);
  }
  return dates;
}

function normalizeProgramEstimatedMinutes(activityType: ProgramActivityType, estimatedDurationMinutes?: number | null): number {
  if (estimatedDurationMinutes != null && Number.isFinite(estimatedDurationMinutes)) {
    return Math.max(0, Math.round(estimatedDurationMinutes));
  }
  if (activityType === 'strength') {
    return 45;
  }
  return PROGRAM_ACTIVITY_DETAILS[activityType].estimatedDurationMinutes;
}

function mapProgramScheduleRow(row: WorkoutProgramDayRow): ProgramScheduleDay {
  const activityType = row.activity_type;
  const exerciseCount = activityType === 'strength' ? row.exercise_count ?? 0 : 0;
  const estimatedDurationMinutes =
    activityType === 'strength'
      ? row.estimated_duration_minutes ?? Math.max(30, exerciseCount * 12)
      : normalizeProgramEstimatedMinutes(activityType, row.estimated_duration_minutes);
  const title =
    activityType === 'strength'
      ? row.workout_name ?? row.title
      : row.title || PROGRAM_ACTIVITY_DETAILS[activityType].title;
  const subtitle =
    row.metadata ??
    (activityType === 'strength'
      ? `${exerciseCount} exercises · ~${estimatedDurationMinutes} min`
      : PROGRAM_ACTIVITY_DETAILS[activityType].subtitle);

  return {
    id: row.id,
    localDate: row.local_date,
    activityType,
    title,
    subtitle,
    routineId: row.routine_id,
    estimatedDurationMinutes,
    exerciseCount,
    source: 'custom',
  };
}

function findRoutineForDefaultTemplate(title: string, routines: RoutineSummaryRow[]): RoutineSummaryRow | undefined {
  const normalized = title.toLowerCase();
  return routines.find((routine) => {
    const name = routine.name.toLowerCase();
    return name === normalized || name.includes(normalized) || normalized.includes(name);
  });
}

function defaultProgramTemplateForDate(localDate: string): { activityType: ProgramActivityType; title: string } {
  const jsDay = new Date(`${localDate}T00:00:00`).getDay();
  const weekDay = (jsDay + 6) % 7;
  switch (weekDay) {
    case 0:
      return { activityType: 'strength', title: 'Upper Strength' };
    case 1:
      return { activityType: 'rest', title: 'Rest day' };
    case 2:
      return { activityType: 'strength', title: 'Lower Strength' };
    case 3:
      return { activityType: 'strength', title: 'Pull' };
    case 4:
      return { activityType: 'rest', title: 'Rest day' };
    case 5:
      return { activityType: 'cardio', title: 'Cardio' };
    default:
      return { activityType: 'recovery', title: 'Active recovery' };
  }
}

function buildDefaultProgramScheduleDay(localDate: string, routines: RoutineSummaryRow[]): ProgramScheduleDay {
  const template = defaultProgramTemplateForDate(localDate);
  if (template.activityType === 'strength') {
    const routine = findRoutineForDefaultTemplate(template.title, routines);
    const exerciseCount = routine?.exercise_count ?? 0;
    const estimatedDurationMinutes = Math.max(30, exerciseCount * 12 || 45);
    return {
      id: `default_${localDate}`,
      localDate,
      activityType: 'strength',
      title: routine?.name ?? template.title,
      subtitle: `${exerciseCount} exercises · ~${estimatedDurationMinutes} min`,
      routineId: routine?.id ?? null,
      estimatedDurationMinutes,
      exerciseCount,
      source: 'default',
    };
  }
  const detail = PROGRAM_ACTIVITY_DETAILS[template.activityType];
  return {
    id: `default_${localDate}`,
    localDate,
    activityType: template.activityType,
    title: detail.title,
    subtitle: detail.subtitle,
    routineId: null,
    estimatedDurationMinutes: detail.estimatedDurationMinutes,
    exerciseCount: 0,
    source: 'default',
  };
}

async function hydrateRoutine(row: RoutineRow): Promise<Routine> {
  const db = await getDatabase();
  const exerciseRows = await db.getAllAsync<RoutineExerciseRow>(
    'SELECT * FROM routine_exercises WHERE routine_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC',
    [row.id],
  );
  const exercises: RoutineExercise[] = [];
  for (const exerciseRow of exerciseRows) {
    const [exercise, setRows] = await Promise.all([
      db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', [exerciseRow.exercise_id]),
      db.getAllAsync<RoutineSetRow>(
        'SELECT * FROM routine_exercise_set_templates WHERE routine_exercise_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC',
        [exerciseRow.id],
      ),
    ]);
    exercises.push({
      id: exerciseRow.id,
      routineId: exerciseRow.routine_id,
      exerciseId: exerciseRow.exercise_id,
      exercise: exercise ? mapExercise(exercise) : undefined,
      sortOrder: exerciseRow.sort_order,
      supersetGroup: exerciseRow.superset_group,
      notes: exerciseRow.notes,
      defaultRestSeconds: exerciseRow.default_rest_seconds,
      setTemplates: setRows.map(mapRoutineSet),
      createdAt: exerciseRow.created_at,
      updatedAt: exerciseRow.updated_at,
      deletedAt: exerciseRow.deleted_at,
      syncStatus: exerciseRow.sync_status,
      version: exerciseRow.version,
    });
  }
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    notes: row.notes,
    sortOrder: row.sort_order,
    exercises,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

async function hydrateWorkoutSession(row: WorkoutSessionRow): Promise<WorkoutSession> {
  const db = await getDatabase();
  const exerciseRows = await db.getAllAsync<WorkoutExerciseRow>(
    'SELECT * FROM workout_exercises WHERE workout_session_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC',
    [row.id],
  );
  const exercises: WorkoutExercise[] = [];
  for (const exerciseRow of exerciseRows) {
    const [exercise, setRows] = await Promise.all([
      db.getFirstAsync<ExerciseRow>('SELECT * FROM exercises WHERE id = ?', [exerciseRow.exercise_id]),
      db.getAllAsync<WorkoutSetRow>(
        'SELECT * FROM workout_sets WHERE workout_exercise_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC',
        [exerciseRow.id],
      ),
    ]);
    exercises.push({
      id: exerciseRow.id,
      workoutSessionId: exerciseRow.workout_session_id,
      exerciseId: exerciseRow.exercise_id,
      exercise: exercise ? mapExercise(exercise) : undefined,
      sortOrder: exerciseRow.sort_order,
      supersetGroup: exerciseRow.superset_group,
      notes: exerciseRow.notes,
      sets: setRows.map(mapWorkoutSet),
      createdAt: exerciseRow.created_at,
      updatedAt: exerciseRow.updated_at,
      deletedAt: exerciseRow.deleted_at,
      syncStatus: exerciseRow.sync_status,
      version: exerciseRow.version,
    });
  }
  return {
    id: row.id,
    userId: row.user_id,
    routineId: row.routine_id,
    title: row.title,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    status: row.status,
    notes: row.notes,
    exercises,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

async function getPreviousPerformance(exerciseId: string, sortOrder: number): Promise<{ weight_kg: number | null; reps: number | null } | null> {
  const db = await getDatabase();
  return db.getFirstAsync<{ weight_kg: number | null; reps: number | null }>(
    `SELECT s.weight_kg, s.reps
     FROM workout_sets s
     JOIN workout_exercises we ON we.id = s.workout_exercise_id
     JOIN workout_sessions ws ON ws.id = we.workout_session_id
     WHERE we.exercise_id = ? AND s.sort_order = ? AND s.is_completed = 1 AND ws.status = 'completed'
     ORDER BY s.completed_at DESC
     LIMIT 1`,
    [exerciseId, sortOrder],
  );
}

async function persistPRs(session: WorkoutSession): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  for (const exercise of session.exercises) {
    for (const set of exercise.sets.filter((item) => item.isCompleted)) {
      const oneRm = estimatedOneRepMax(set.weightKg ?? 0, set.reps ?? 0);
      if (oneRm <= 0) {
        continue;
      }
      const previous = await db.getFirstAsync<{ value: number }>(
        "SELECT value FROM exercise_prs WHERE user_id = ? AND exercise_id = ? AND pr_type = 'estimated_1rm' ORDER BY value DESC LIMIT 1",
        [session.userId, exercise.exerciseId],
      );
      if (!previous || oneRm > previous.value) {
        const id = createId('pr');
        await db.runAsync(
          `INSERT INTO exercise_prs
          (id, user_id, exercise_id, workout_set_id, pr_type, value, achieved_at, created_at, updated_at, deleted_at, sync_status, version)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, session.userId, exercise.exerciseId, set.id, 'estimated_1rm', oneRm, set.completedAt ?? now, now, now, null, 'pending', 1],
        );
      }
    }
  }
}

function calculateSetVolumeAggregate(sets: WorkoutSet[]): number {
  return Math.round(sets.reduce((total, set) => total + calculateSetVolume(set), 0) * 10) / 10;
}

function mapExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    primaryMuscle: row.primary_muscle,
    equipment: row.equipment,
    instructions: row.instructions,
    isCustom: Boolean(row.is_custom),
  };
}

function mapRoutineSet(row: RoutineSetRow): RoutineExerciseSetTemplate {
  return {
    id: row.id,
    routineExerciseId: row.routine_exercise_id,
    sortOrder: row.sort_order,
    setType: row.set_type,
    targetRepsMin: row.target_reps_min,
    targetRepsMax: row.target_reps_max,
    targetWeightKg: row.target_weight_kg,
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

function mapWorkoutSet(row: WorkoutSetRow): WorkoutSet {
  return {
    id: row.id,
    workoutExerciseId: row.workout_exercise_id,
    sortOrder: row.sort_order,
    setType: row.set_type,
    weightKg: row.weight_kg,
    reps: row.reps,
    durationSeconds: row.duration_seconds,
    distanceMeters: row.distance_meters,
    rpe: row.rpe,
    rir: row.rir,
    isCompleted: Boolean(row.is_completed),
    completedAt: row.completed_at,
    previousWeightKg: row.previous_weight_kg,
    previousReps: row.previous_reps,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}
