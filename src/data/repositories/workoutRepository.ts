import { getDatabase } from '@/data/db/database';
import { createId, DEMO_USER_ID } from '@/data/db/ids';
import { enqueueSync } from '@/data/sync/syncQueue';
import { calculateSetVolume, estimatedOneRepMax } from '@/domain/calculations/workout';
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

export async function startWorkoutFromRoutine(routineId: string, userId = DEMO_USER_ID): Promise<string> {
  const db = await getDatabase();
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
  const now = new Date().toISOString();
  const sessionId = createId('workout');
  await db.runAsync(
    `INSERT INTO workout_sessions
    (id, user_id, routine_id, title, started_at, ended_at, status, notes, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, null, 'Empty Workout', now, null, 'active', null, now, now, null, 'pending', 1],
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
