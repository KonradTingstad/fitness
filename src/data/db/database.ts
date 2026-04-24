import * as SQLite from 'expo-sqlite';

import { seedDatabase } from '@/data/seed/sampleData';

const DB_NAME = 'formfuel.db';
const SCHEMA_VERSION = 1;

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DB_NAME);
  }
  return databasePromise;
}

export async function initializeDatabase(): Promise<void> {
  const db = await getDatabase();
  await db.execAsync('PRAGMA foreign_keys = ON;');
  await db.execAsync(MIGRATION_SQL);
  const version = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', [
    'schema_version',
  ]);
  if (!version) {
    await db.runAsync('INSERT INTO app_metadata (key, value) VALUES (?, ?)', ['schema_version', String(SCHEMA_VERSION)]);
  }
  await seedDatabase(db);
}

const auditColumns = `
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  version INTEGER NOT NULL DEFAULT 1
`;

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT,
  ${auditColumns}
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS user_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  age INTEGER,
  sex TEXT,
  height_cm REAL NOT NULL,
  current_weight_kg REAL NOT NULL,
  diet_preferences TEXT,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);

CREATE TABLE IF NOT EXISTS user_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  theme TEXT NOT NULL,
  notifications_enabled INTEGER NOT NULL,
  rest_timer_default_seconds INTEGER NOT NULL,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);

CREATE TABLE IF NOT EXISTS unit_preferences (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  body_weight_unit TEXT NOT NULL,
  load_unit TEXT NOT NULL,
  distance_unit TEXT NOT NULL,
  volume_unit TEXT NOT NULL,
  energy_unit TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_unit_preferences_user ON unit_preferences(user_id);

CREATE TABLE IF NOT EXISTS goal_settings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  goal TEXT NOT NULL,
  activity_level TEXT NOT NULL,
  workouts_per_week_target INTEGER NOT NULL,
  calorie_target REAL NOT NULL,
  protein_target_g REAL NOT NULL,
  carb_target_g REAL NOT NULL,
  fat_target_g REAL NOT NULL,
  water_target_ml REAL NOT NULL,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_goal_settings_user ON goal_settings(user_id);

CREATE TABLE IF NOT EXISTS exercises (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  primary_muscle TEXT NOT NULL,
  equipment TEXT NOT NULL,
  instructions TEXT,
  is_custom INTEGER NOT NULL DEFAULT 0,
  ${auditColumns}
);
CREATE INDEX IF NOT EXISTS idx_exercises_name ON exercises(name);
CREATE INDEX IF NOT EXISTS idx_exercises_muscle ON exercises(primary_muscle);
CREATE INDEX IF NOT EXISTS idx_exercises_user ON exercises(user_id);

CREATE TABLE IF NOT EXISTS exercise_aliases (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  alias TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_exercise_aliases_exercise ON exercise_aliases(exercise_id);
CREATE INDEX IF NOT EXISTS idx_exercise_aliases_alias ON exercise_aliases(alias);

CREATE TABLE IF NOT EXISTS exercise_muscle_groups (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  muscle_group TEXT NOT NULL,
  role TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_exercise_muscle_groups_exercise ON exercise_muscle_groups(exercise_id);

CREATE TABLE IF NOT EXISTS exercise_equipment (
  id TEXT PRIMARY KEY,
  exercise_id TEXT NOT NULL,
  equipment TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_exercise_equipment_exercise ON exercise_equipment(exercise_id);

CREATE TABLE IF NOT EXISTS routines (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_routines_user ON routines(user_id);

CREATE TABLE IF NOT EXISTS routine_exercises (
  id TEXT PRIMARY KEY,
  routine_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  superset_group TEXT,
  notes TEXT,
  default_rest_seconds INTEGER NOT NULL,
  ${auditColumns},
  FOREIGN KEY(routine_id) REFERENCES routines(id),
  FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_routine_exercises_routine ON routine_exercises(routine_id);

CREATE TABLE IF NOT EXISTS routine_exercise_set_templates (
  id TEXT PRIMARY KEY,
  routine_exercise_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  set_type TEXT NOT NULL,
  target_reps_min INTEGER,
  target_reps_max INTEGER,
  target_weight_kg REAL,
  duration_seconds INTEGER,
  distance_meters REAL,
  ${auditColumns},
  FOREIGN KEY(routine_exercise_id) REFERENCES routine_exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_routine_sets_routine_exercise ON routine_exercise_set_templates(routine_exercise_id);

CREATE TABLE IF NOT EXISTS workout_plans (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  routine_id TEXT NOT NULL,
  scheduled_time TEXT,
  estimated_duration_minutes INTEGER,
  notes TEXT,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(routine_id) REFERENCES routines(id)
);
CREATE INDEX IF NOT EXISTS idx_workout_plans_user_date ON workout_plans(user_id, local_date);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  routine_id TEXT,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  status TEXT NOT NULL,
  notes TEXT,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(routine_id) REFERENCES routines(id)
);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_started ON workout_sessions(user_id, started_at);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_status ON workout_sessions(status);

CREATE TABLE IF NOT EXISTS workout_exercises (
  id TEXT PRIMARY KEY,
  workout_session_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  superset_group TEXT,
  notes TEXT,
  ${auditColumns},
  FOREIGN KEY(workout_session_id) REFERENCES workout_sessions(id),
  FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_workout_exercises_session ON workout_exercises(workout_session_id);

CREATE TABLE IF NOT EXISTS workout_sets (
  id TEXT PRIMARY KEY,
  workout_exercise_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  set_type TEXT NOT NULL,
  weight_kg REAL,
  reps INTEGER,
  duration_seconds INTEGER,
  distance_meters REAL,
  rpe REAL,
  rir REAL,
  is_completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  previous_weight_kg REAL,
  previous_reps INTEGER,
  ${auditColumns},
  FOREIGN KEY(workout_exercise_id) REFERENCES workout_exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_workout_sets_exercise ON workout_sets(workout_exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_sets_completed ON workout_sets(completed_at);

CREATE TABLE IF NOT EXISTS workout_notes (
  id TEXT PRIMARY KEY,
  workout_session_id TEXT NOT NULL,
  exercise_id TEXT,
  set_id TEXT,
  body TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(workout_session_id) REFERENCES workout_sessions(id)
);
CREATE INDEX IF NOT EXISTS idx_workout_notes_session ON workout_notes(workout_session_id);

CREATE TABLE IF NOT EXISTS exercise_prs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_id TEXT NOT NULL,
  workout_set_id TEXT,
  pr_type TEXT NOT NULL,
  value REAL NOT NULL,
  achieved_at TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_exercise_prs_user_exercise ON exercise_prs(user_id, exercise_id, pr_type);

CREATE TABLE IF NOT EXISTS body_measurements (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  measured_on TEXT NOT NULL,
  type TEXT NOT NULL,
  value REAL NOT NULL,
  unit TEXT,
  notes TEXT,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON body_measurements(user_id, measured_on, type);

CREATE TABLE IF NOT EXISTS body_weight_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  logged_on TEXT NOT NULL,
  weight_kg REAL NOT NULL,
  notes TEXT,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_body_weight_logs_user_date ON body_weight_logs(user_id, logged_on);

CREATE TABLE IF NOT EXISTS food_brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  source_provider TEXT,
  ${auditColumns}
);
CREATE INDEX IF NOT EXISTS idx_food_brands_name ON food_brands(name);

CREATE TABLE IF NOT EXISTS food_items (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  brand_id TEXT,
  brand_name TEXT,
  name TEXT NOT NULL,
  serving_size REAL NOT NULL,
  serving_unit TEXT NOT NULL,
  grams_per_serving REAL NOT NULL,
  calories REAL NOT NULL,
  protein_g REAL NOT NULL,
  carbs_g REAL NOT NULL,
  fat_g REAL NOT NULL,
  fiber_g REAL,
  sugar_g REAL,
  saturated_fat_g REAL,
  sodium_mg REAL,
  barcode TEXT,
  source_provider TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  is_custom INTEGER NOT NULL DEFAULT 0,
  ${auditColumns}
);
CREATE INDEX IF NOT EXISTS idx_food_items_name ON food_items(name);
CREATE INDEX IF NOT EXISTS idx_food_items_barcode ON food_items(barcode);
CREATE INDEX IF NOT EXISTS idx_food_items_user ON food_items(user_id);

CREATE TABLE IF NOT EXISTS food_servings (
  id TEXT PRIMARY KEY,
  food_item_id TEXT NOT NULL,
  label TEXT NOT NULL,
  grams REAL NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  ${auditColumns},
  FOREIGN KEY(food_item_id) REFERENCES food_items(id)
);
CREATE INDEX IF NOT EXISTS idx_food_servings_food ON food_servings(food_item_id);

CREATE TABLE IF NOT EXISTS barcode_mappings (
  id TEXT PRIMARY KEY,
  barcode TEXT NOT NULL UNIQUE,
  food_item_id TEXT NOT NULL,
  source_provider TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(food_item_id) REFERENCES food_items(id)
);

CREATE TABLE IF NOT EXISTS custom_foods (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  food_item_id TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(food_item_id) REFERENCES food_items(id)
);
CREATE INDEX IF NOT EXISTS idx_custom_foods_user ON custom_foods(user_id);

CREATE TABLE IF NOT EXISTS saved_meals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  notes TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_saved_meals_user ON saved_meals(user_id);

CREATE TABLE IF NOT EXISTS saved_meal_items (
  id TEXT PRIMARY KEY,
  saved_meal_id TEXT NOT NULL,
  food_item_id TEXT NOT NULL,
  servings REAL NOT NULL,
  meal_slot TEXT,
  ${auditColumns},
  FOREIGN KEY(saved_meal_id) REFERENCES saved_meals(id),
  FOREIGN KEY(food_item_id) REFERENCES food_items(id)
);
CREATE INDEX IF NOT EXISTS idx_saved_meal_items_meal ON saved_meal_items(saved_meal_id);

CREATE TABLE IF NOT EXISTS recipes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  serving_count REAL NOT NULL,
  instructions TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_recipes_user ON recipes(user_id);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id TEXT PRIMARY KEY,
  recipe_id TEXT NOT NULL,
  food_item_id TEXT NOT NULL,
  servings REAL NOT NULL,
  grams REAL,
  ${auditColumns},
  FOREIGN KEY(recipe_id) REFERENCES recipes(id),
  FOREIGN KEY(food_item_id) REFERENCES food_items(id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_recipe ON recipe_ingredients(recipe_id);

CREATE TABLE IF NOT EXISTS diary_days (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  notes TEXT,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id),
  UNIQUE(user_id, local_date)
);
CREATE INDEX IF NOT EXISTS idx_diary_days_user_date ON diary_days(user_id, local_date);

CREATE TABLE IF NOT EXISTS diary_entries (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  diary_day_id TEXT NOT NULL,
  meal_slot TEXT NOT NULL,
  food_item_id TEXT NOT NULL,
  servings REAL NOT NULL,
  logged_at TEXT NOT NULL,
  food_name_snapshot TEXT NOT NULL,
  calories_snapshot REAL NOT NULL,
  protein_g_snapshot REAL NOT NULL,
  carbs_g_snapshot REAL NOT NULL,
  fat_g_snapshot REAL NOT NULL,
  fiber_g_snapshot REAL,
  sodium_mg_snapshot REAL,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(diary_day_id) REFERENCES diary_days(id),
  FOREIGN KEY(food_item_id) REFERENCES food_items(id)
);
CREATE INDEX IF NOT EXISTS idx_diary_entries_day ON diary_entries(user_id, diary_day_id);
CREATE INDEX IF NOT EXISTS idx_diary_entries_meal ON diary_entries(meal_slot);

CREATE TABLE IF NOT EXISTS water_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  local_date TEXT NOT NULL,
  amount_ml REAL NOT NULL,
  logged_at TEXT NOT NULL,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON water_logs(user_id, local_date);

CREATE TABLE IF NOT EXISTS progress_widgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  metric TEXT NOT NULL,
  chart_type TEXT NOT NULL,
  time_range TEXT NOT NULL,
  exercise_id TEXT,
  unit TEXT,
  grouping TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(exercise_id) REFERENCES exercises(id)
);
CREATE INDEX IF NOT EXISTS idx_progress_widgets_user_position ON progress_widgets(user_id, position);

CREATE TABLE IF NOT EXISTS progress_overview_modules (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  ${auditColumns},
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_progress_overview_modules_user_position ON progress_overview_modules(user_id, position);

CREATE TABLE IF NOT EXISTS sync_queue (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  next_retry_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status);
CREATE INDEX IF NOT EXISTS idx_sync_queue_entity ON sync_queue(entity_type, entity_id);
`;
