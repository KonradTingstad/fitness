import * as SQLite from 'expo-sqlite';

import { DEMO_USER_ID } from '@/data/db/ids';
import { shiftLocalDate, toLocalDateKey } from '@/domain/calculations/dates';

const nowIso = () => new Date().toISOString();

const audit = () => {
  const now = nowIso();
  return { createdAt: now, updatedAt: now, deletedAt: null, syncStatus: 'synced', version: 1 };
};

export async function seedDatabase(db: SQLite.SQLiteDatabase): Promise<void> {
  const existing = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) as count FROM users WHERE id = ?', [
    DEMO_USER_ID,
  ]);
  if ((existing?.count ?? 0) > 0) {
    return;
  }

  await seedUser(db);
  await seedExerciseLibrary(db);
  await seedFoodLibrary(db);
  await seedRoutine(db);
  await seedHistory(db);
  await seedSavedNutrition(db);
}

async function seedUser(db: SQLite.SQLiteDatabase): Promise<void> {
  const fields = audit();
  await db.runAsync(
    `INSERT INTO users
    (id, email, display_name, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [DEMO_USER_ID, 'demo@formfuel.local', 'Demo Athlete', fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  await db.runAsync(
    `INSERT INTO user_profiles
    (id, user_id, age, sex, height_cm, current_weight_kg, diet_preferences, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['profile_demo', DEMO_USER_ID, 32, 'prefer_not_to_say', 178, 82.4, 'High protein', fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  await db.runAsync(
    `INSERT INTO user_settings
    (id, user_id, theme, notifications_enabled, rest_timer_default_seconds, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['settings_demo', DEMO_USER_ID, 'system', 1, 120, fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  await db.runAsync(
    `INSERT INTO unit_preferences
    (id, user_id, body_weight_unit, load_unit, distance_unit, volume_unit, energy_unit, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['units_demo', DEMO_USER_ID, 'kg', 'kg', 'km', 'ml', 'kcal', fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  await db.runAsync(
    `INSERT INTO goal_settings
    (id, user_id, goal, activity_level, workouts_per_week_target, calorie_target, protein_target_g, carb_target_g, fat_target_g, water_target_ml, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['goals_demo', DEMO_USER_ID, 'maintain', 'moderate', 4, 2550, 165, 290, 80, 2800, fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
}

async function seedExerciseLibrary(db: SQLite.SQLiteDatabase): Promise<void> {
  const fields = audit();
  const exercises = [
    ['exercise_back_squat', 'Back Squat', 'Quads', 'Barbell', 'Brace, sit between the hips, and keep the bar path over mid-foot.'],
    ['exercise_bench_press', 'Bench Press', 'Chest', 'Barbell', 'Keep shoulder blades pinned and press with consistent leg drive.'],
    ['exercise_deadlift', 'Deadlift', 'Posterior Chain', 'Barbell', 'Set lats, push the floor away, and finish tall without leaning back.'],
    ['exercise_pull_up', 'Pull-Up', 'Back', 'Bodyweight', 'Start from a dead hang and pull elbows toward the ribs.'],
    ['exercise_overhead_press', 'Overhead Press', 'Shoulders', 'Barbell', 'Squeeze glutes, keep ribs down, and move the head through after the bar clears.'],
    ['exercise_row', 'Chest-Supported Row', 'Back', 'Machine', 'Pull elbows back while keeping chest connected to the pad.'],
    ['exercise_leg_press', 'Leg Press', 'Quads', 'Machine', 'Control depth and keep hips down on the pad.'],
    ['exercise_treadmill', 'Treadmill Run', 'Cardio', 'Machine', 'Log duration, distance, and effort.'],
  ];
  for (const exercise of exercises) {
    await db.runAsync(
      `INSERT INTO exercises
      (id, user_id, name, primary_muscle, equipment, instructions, is_custom, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [exercise[0], null, exercise[1], exercise[2], exercise[3], exercise[4], 0, fields.createdAt, fields.updatedAt, null, 'synced', 1],
    );
  }
}

async function seedFoodLibrary(db: SQLite.SQLiteDatabase): Promise<void> {
  const fields = audit();
  const foods = [
    ['food_greek_yogurt', 'Nordic Dairy', 'Greek Yogurt 2%', 1, 'cup', 225, 150, 23, 8, 4, 0, 5, 95, 'seed', 1],
    ['food_oats', null, 'Rolled Oats', 0.5, 'cup', 40, 150, 5, 27, 3, 4, 1, 0, 'seed', 1],
    ['food_chicken_breast', null, 'Chicken Breast, cooked', 100, 'g', 100, 165, 31, 0, 3.6, 0, 0, 74, 'seed', 1],
    ['food_rice', null, 'Jasmine Rice, cooked', 1, 'cup', 158, 205, 4.3, 44.5, 0.4, 0.6, 0.1, 2, 'seed', 1],
    ['food_banana', null, 'Banana', 1, 'medium', 118, 105, 1.3, 27, 0.4, 3.1, 14.4, 1, 'seed', 1],
    ['food_whey', 'FormFuel', 'Whey Protein', 1, 'scoop', 32, 125, 25, 3, 1.5, 0, 1, 90, 'seed', 1],
    ['food_salmon', null, 'Salmon Fillet', 100, 'g', 100, 208, 20, 0, 13, 0, 0, 59, 'seed', 1],
    ['food_avocado', null, 'Avocado', 0.5, 'fruit', 75, 120, 1.5, 6, 11, 5, 0.5, 5, 'seed', 1],
  ];
  for (const food of foods) {
    await db.runAsync(
      `INSERT INTO food_items
      (id, user_id, brand_id, brand_name, name, serving_size, serving_unit, grams_per_serving, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source_provider, is_verified, is_custom, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        food[0],
        null,
        null,
        food[1],
        food[2],
        food[3],
        food[4],
        food[5],
        food[6],
        food[7],
        food[8],
        food[9],
        food[10],
        food[11],
        food[12],
        food[13],
        food[14],
        0,
        fields.createdAt,
        fields.updatedAt,
        null,
        'synced',
        1,
      ],
    );
  }
}

async function seedRoutine(db: SQLite.SQLiteDatabase): Promise<void> {
  const fields = audit();
  await db.runAsync(
    `INSERT INTO routines
    (id, user_id, name, notes, sort_order, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['routine_upper_strength', DEMO_USER_ID, 'Upper Strength', 'Heavy press, pull, and shoulder work.', 1, fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  const routineExercises = [
    ['routine_ex_bench', 'exercise_bench_press', 1, null, 'Top set then controlled back-off volume.', 150],
    ['routine_ex_pullup', 'exercise_pull_up', 2, 'A', 'Pair with rows when the gym is busy.', 120],
    ['routine_ex_row', 'exercise_row', 3, 'A', null, 90],
    ['routine_ex_press', 'exercise_overhead_press', 4, null, null, 120],
  ];
  for (const row of routineExercises) {
    await db.runAsync(
      `INSERT INTO routine_exercises
      (id, routine_id, exercise_id, sort_order, superset_group, notes, default_rest_seconds, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row[0], 'routine_upper_strength', row[1], row[2], row[3], row[4], row[5], fields.createdAt, fields.updatedAt, null, 'synced', 1],
    );
  }
  const setTemplates = [
    ['routine_set_bench_1', 'routine_ex_bench', 1, 'warmup', 8, 8, 60],
    ['routine_set_bench_2', 'routine_ex_bench', 2, 'normal', 5, 5, 90],
    ['routine_set_bench_3', 'routine_ex_bench', 3, 'normal', 5, 5, 90],
    ['routine_set_pull_1', 'routine_ex_pullup', 1, 'normal', 6, 8, null],
    ['routine_set_pull_2', 'routine_ex_pullup', 2, 'failure', 6, 10, null],
    ['routine_set_row_1', 'routine_ex_row', 1, 'normal', 8, 10, 65],
    ['routine_set_row_2', 'routine_ex_row', 2, 'normal', 8, 10, 65],
    ['routine_set_press_1', 'routine_ex_press', 1, 'normal', 5, 6, 42.5],
    ['routine_set_press_2', 'routine_ex_press', 2, 'normal', 5, 6, 42.5],
  ];
  for (const row of setTemplates) {
    await db.runAsync(
      `INSERT INTO routine_exercise_set_templates
      (id, routine_exercise_id, sort_order, set_type, target_reps_min, target_reps_max, target_weight_kg, duration_seconds, distance_meters, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [row[0], row[1], row[2], row[3], row[4], row[5], row[6], null, null, fields.createdAt, fields.updatedAt, null, 'synced', 1],
    );
  }
}

async function seedHistory(db: SQLite.SQLiteDatabase): Promise<void> {
  const fields = audit();
  const today = toLocalDateKey();
  await db.runAsync(
    `INSERT INTO workout_plans
    (id, user_id, local_date, routine_id, scheduled_time, estimated_duration_minutes, notes, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'plan_today_upper_strength',
      DEMO_USER_ID,
      today,
      'routine_upper_strength',
      '18:00',
      55,
      'Planned at the start of the week.',
      fields.createdAt,
      fields.updatedAt,
      null,
      'synced',
      1,
    ],
  );

  const weightRows = [
    [-21, 83.3],
    [-14, 82.9],
    [-7, 82.6],
    [-1, 82.4],
  ];
  for (const [offset, weight] of weightRows) {
    await db.runAsync(
      `INSERT INTO body_weight_logs
      (id, user_id, logged_on, weight_kg, notes, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`body_weight_${offset}`, DEMO_USER_ID, shiftLocalDate(today, offset), weight, null, fields.createdAt, fields.updatedAt, null, 'synced', 1],
    );
  }

  await seedCompletedWorkout(db, 'history_workout_lower', 'Lower Strength', shiftLocalDate(today, -5), [
    ['exercise_back_squat', 100, 5, 'normal'],
    ['exercise_back_squat', 105, 5, 'normal'],
    ['exercise_deadlift', 140, 3, 'normal'],
    ['exercise_leg_press', 170, 10, 'normal'],
  ]);
  await seedCompletedWorkout(db, 'history_workout_upper', 'Upper Strength', shiftLocalDate(today, -2), [
    ['exercise_bench_press', 90, 5, 'normal'],
    ['exercise_bench_press', 92.5, 4, 'normal'],
    ['exercise_pull_up', 0, 9, 'bodyweight'],
    ['exercise_row', 70, 8, 'normal'],
  ]);

  const diaryDates = [shiftLocalDate(today, -2), shiftLocalDate(today, -1), today];
  for (const localDate of diaryDates) {
    await ensureDiaryDay(db, localDate);
  }
  await addSeedDiaryEntry(db, today, 'breakfast', 'food_greek_yogurt', 1);
  await addSeedDiaryEntry(db, today, 'breakfast', 'food_oats', 1);
  await addSeedDiaryEntry(db, today, 'snacks', 'food_whey', 1);
  await db.runAsync(
    `INSERT INTO water_logs
    (id, user_id, local_date, amount_ml, logged_at, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['water_today_1', DEMO_USER_ID, today, 750, nowIso(), fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
}

async function seedCompletedWorkout(
  db: SQLite.SQLiteDatabase,
  sessionId: string,
  title: string,
  localDate: string,
  rows: Array<[string, number, number, string]>,
): Promise<void> {
  const fields = audit();
  const startedAt = `${localDate}T17:30:00.000Z`;
  const endedAt = `${localDate}T18:35:00.000Z`;
  await db.runAsync(
    `INSERT INTO workout_sessions
    (id, user_id, routine_id, title, started_at, ended_at, status, notes, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, DEMO_USER_ID, null, title, startedAt, endedAt, 'completed', null, fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  const exerciseIds = Array.from(new Set(rows.map((row) => row[0])));
  for (const [index, exerciseId] of exerciseIds.entries()) {
    await db.runAsync(
      `INSERT INTO workout_exercises
      (id, workout_session_id, exercise_id, sort_order, superset_group, notes, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [`${sessionId}_${exerciseId}`, sessionId, exerciseId, index + 1, null, null, fields.createdAt, fields.updatedAt, null, 'synced', 1],
    );
  }
  for (const [index, row] of rows.entries()) {
    const [exerciseId, weightKg, reps, setType] = row;
    await db.runAsync(
      `INSERT INTO workout_sets
      (id, workout_exercise_id, sort_order, set_type, weight_kg, reps, duration_seconds, distance_meters, rpe, rir, is_completed, completed_at, previous_weight_kg, previous_reps, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        `${sessionId}_set_${index}`,
        `${sessionId}_${exerciseId}`,
        index + 1,
        setType,
        weightKg,
        reps,
        null,
        null,
        null,
        null,
        1,
        endedAt,
        null,
        null,
        fields.createdAt,
        fields.updatedAt,
        null,
        'synced',
        1,
      ],
    );
  }
}

async function ensureDiaryDay(db: SQLite.SQLiteDatabase, localDate: string): Promise<string> {
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM diary_days WHERE user_id = ? AND local_date = ?',
    [DEMO_USER_ID, localDate],
  );
  if (existing) {
    return existing.id;
  }
  const fields = audit();
  const id = `diary_${localDate}`;
  await db.runAsync(
    `INSERT INTO diary_days
    (id, user_id, local_date, notes, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, DEMO_USER_ID, localDate, null, fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  return id;
}

async function addSeedDiaryEntry(
  db: SQLite.SQLiteDatabase,
  localDate: string,
  mealSlot: string,
  foodItemId: string,
  servings: number,
): Promise<void> {
  const dayId = await ensureDiaryDay(db, localDate);
  const food = await db.getFirstAsync<{
    name: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number | null;
    sodium_mg: number | null;
  }>('SELECT name, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg FROM food_items WHERE id = ?', [foodItemId]);
  if (!food) {
    return;
  }
  const fields = audit();
  await db.runAsync(
    `INSERT INTO diary_entries
    (id, user_id, diary_day_id, meal_slot, food_item_id, servings, logged_at, food_name_snapshot, calories_snapshot, protein_g_snapshot, carbs_g_snapshot, fat_g_snapshot, fiber_g_snapshot, sodium_mg_snapshot, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `entry_${localDate}_${mealSlot}_${foodItemId}`,
      DEMO_USER_ID,
      dayId,
      mealSlot,
      foodItemId,
      servings,
      nowIso(),
      food.name,
      food.calories,
      food.protein_g,
      food.carbs_g,
      food.fat_g,
      food.fiber_g,
      food.sodium_mg,
      fields.createdAt,
      fields.updatedAt,
      null,
      'synced',
      1,
    ],
  );
}

async function seedSavedNutrition(db: SQLite.SQLiteDatabase): Promise<void> {
  const fields = audit();
  await db.runAsync(
    `INSERT INTO saved_meals
    (id, user_id, name, notes, is_favorite, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['saved_meal_power_breakfast', DEMO_USER_ID, 'Power Breakfast', 'Yogurt, oats, and banana.', 1, fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  const items = [
    ['saved_meal_item_yogurt', 'food_greek_yogurt', 1],
    ['saved_meal_item_oats', 'food_oats', 1],
    ['saved_meal_item_banana', 'food_banana', 1],
  ];
  for (const item of items) {
    await db.runAsync(
      `INSERT INTO saved_meal_items
      (id, saved_meal_id, food_item_id, servings, meal_slot, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item[0], 'saved_meal_power_breakfast', item[1], item[2], 'breakfast', fields.createdAt, fields.updatedAt, null, 'synced', 1],
    );
  }
  await db.runAsync(
    `INSERT INTO recipes
    (id, user_id, name, serving_count, instructions, is_favorite, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ['recipe_salmon_bowl', DEMO_USER_ID, 'Salmon Rice Bowl', 2, 'Cook rice, flake salmon, add avocado and seasoning.', 1, fields.createdAt, fields.updatedAt, null, 'synced', 1],
  );
  const recipeItems = [
    ['recipe_ing_salmon', 'food_salmon', 3],
    ['recipe_ing_rice', 'food_rice', 2],
    ['recipe_ing_avocado', 'food_avocado', 2],
  ];
  for (const item of recipeItems) {
    await db.runAsync(
      `INSERT INTO recipe_ingredients
      (id, recipe_id, food_item_id, servings, grams, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [item[0], 'recipe_salmon_bowl', item[1], item[2], null, fields.createdAt, fields.updatedAt, null, 'synced', 1],
    );
  }
}
