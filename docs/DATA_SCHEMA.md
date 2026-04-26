# FormFuel Data Schema

All syncable records use stable UUID text primary keys. Canonical units are stored internally: weight in kilograms for body mass, exercise load in kilograms, nutrition mass in grams, energy in kilocalories, volume in milliliters, and durations in seconds. Most user-owned tables include `user_id`, `created_at`, `updated_at`, `deleted_at`, `sync_status`, and `version`.

## Auth And Profile

### users

- `id` UUID primary key. Remote source of truth: Supabase Auth. Local source: cached identity.
- Required: `email`, `created_at`, `updated_at`.
- Optional: `display_name`, `deleted_at`.
- Indexes: `email`.
- Ownership: self.
- Sync: remote auth owns credentials; local stores only profile-facing identity.

### user_profiles

- Required: `user_id`, `height_cm`, `current_weight_kg`.
- Optional: `age`, `sex`, `diet_preferences`.
- Indexes: `user_id`.
- Conflict: last-write-wins.

### user_settings

- Required: `user_id`, `theme`, `notifications_enabled`, `rest_timer_default_seconds`.
- Indexes: `user_id`.
- Conflict: last-write-wins.

### unit_preferences

- Required: `user_id`, `body_weight_unit`, `load_unit`, `distance_unit`, `volume_unit`, `energy_unit`.
- Conflict: last-write-wins.

### goal_settings

- Required: `user_id`, `goal`, `activity_level`, `workouts_per_week_target`, `calorie_target`, `protein_target_g`, `carb_target_g`, `fat_target_g`, `water_target_ml`.
- Optional: `macro_split`.
- Conflict: last-write-wins.

## Workout Domain

### exercises

- Required: `id`, `name`, `primary_muscle`, `equipment`.
- Optional: `instructions`, `is_custom`, `user_id`.
- Indexes: `name`, `primary_muscle`, `user_id`.
- Source of truth: seeded global rows plus local/remote user custom rows.

### exercise_aliases

- Required: `id`, `exercise_id`, `alias`.
- Indexes: `exercise_id`, `alias`.
- Sync: aliases for custom exercises sync with owner.

### exercise_muscle_groups

- Required: `id`, `exercise_id`, `muscle_group`, `role`.
- Indexes: `exercise_id`, `muscle_group`.

### exercise_equipment

- Required: `id`, `exercise_id`, `equipment`.
- Indexes: `exercise_id`, `equipment`.

### routines

- Required: `id`, `user_id`, `name`.
- Optional: `notes`, `sort_order`.
- Indexes: `user_id`, `updated_at`.
- Sync: user-owned upsert by UUID.

### routine_exercises

- Required: `id`, `routine_id`, `exercise_id`, `sort_order`.
- Optional: `superset_group`, `notes`, `default_rest_seconds`.
- Indexes: `routine_id`, `exercise_id`.
- Sync: merge by UUID; reorder uses `sort_order`.

### routine_exercise_set_templates

- Required: `id`, `routine_exercise_id`, `sort_order`, `set_type`.
- Optional: `target_reps_min`, `target_reps_max`, `target_weight_kg`, `duration_seconds`, `distance_meters`.
- Indexes: `routine_exercise_id`.

### workout_sessions

- Required: `id`, `user_id`, `title`, `started_at`, `status`.
- Optional: `routine_id`, `ended_at`, `notes`.
- Indexes: `user_id`, `started_at`, `status`.
- Sync: active workouts merge by stable UUID. Completed sessions preserve completed set rows.

### workout_exercises

- Required: `id`, `workout_session_id`, `exercise_id`, `sort_order`.
- Optional: `superset_group`, `notes`.
- Indexes: `workout_session_id`, `exercise_id`.
- Sync: merge by UUID.

### workout_sets

- Required: `id`, `workout_exercise_id`, `sort_order`, `set_type`, `is_completed`.
- Optional: `weight_kg`, `reps`, `duration_seconds`, `distance_meters`, `rpe`, `rir`, `completed_at`, `previous_weight_kg`, `previous_reps`.
- Indexes: `workout_exercise_id`, `completed_at`.
- Sync: merge by UUID. Completed data wins over blank remote data.

### workout_notes

- Required: `id`, `workout_session_id`, `body`.
- Optional: `exercise_id`, `set_id`.
- Indexes: `workout_session_id`.

### exercise_prs

- Required: `id`, `user_id`, `exercise_id`, `pr_type`, `value`, `achieved_at`.
- Optional: `workout_set_id`.
- Indexes: `user_id`, `exercise_id`, `pr_type`.
- Source: derived and persisted for fast display.

### body_measurements

- Required: `id`, `user_id`, `measured_on`, `type`, `value`.
- Optional: `unit`, `notes`.
- Indexes: `user_id`, `measured_on`, `type`.

### body_weight_logs

- Required: `id`, `user_id`, `logged_on`, `weight_kg`.
- Optional: `notes`.
- Indexes: `user_id`, `logged_on`.

## Nutrition Domain

### food_brands

- Required: `id`, `name`.
- Optional: `source_provider`.
- Indexes: `name`.

### food_items

- Required: `id`, `name`, `serving_size`, `serving_unit`, `calories`, `protein_g`, `carbs_g`, `fat_g`.
- Optional: `brand_id`, `brand_name`, `grams_per_serving`, `fiber_g`, `sugar_g`, `saturated_fat_g`, `sodium_mg`, `barcode`, `source_provider`, `is_verified`, `is_custom`, `user_id`, `variant`, `package_size`, `source_product_id`, `source_url`, `api_url`, `imported_at`, `private_snapshot`, `kj_per_100`, `calories_per_100`, `protein_per_100`, `carbs_per_100`, `sugar_per_100`, `fat_per_100`, `saturated_fat_per_100`, `fiber_per_100`, `salt_per_100`, `ingredients`, `allergens`, `raw_source_data`.
- Indexes: `name`, `brand_name`, `barcode`, `user_id`, `source_provider`, `source_product_id`.
- Constraints: unique `(source_provider, source_product_id)` when `source_product_id` is present; unique `barcode` for `source_provider='oda_private_snapshot'` when barcode is present.
- Source: provider cache, seeded foods, custom user foods.

### food_servings

- Required: `id`, `food_item_id`, `label`, `grams`.
- Optional: `is_default`.
- Indexes: `food_item_id`.

### barcode_mappings

- Required: `id`, `barcode`, `food_item_id`, `source_provider`.
- Indexes: unique `barcode`.
- Sync: provider cache plus custom mappings.

### custom_foods

- Required: `id`, `user_id`, `food_item_id`.
- Indexes: `user_id`, `food_item_id`.
- Sync: user-owned.

### saved_meals

- Required: `id`, `user_id`, `name`.
- Optional: `notes`, `is_favorite`.
- Indexes: `user_id`, `name`.

### saved_meal_items

- Required: `id`, `saved_meal_id`, `food_item_id`, `servings`.
- Optional: `meal_slot`.
- Indexes: `saved_meal_id`.

### recipes

- Required: `id`, `user_id`, `name`, `serving_count`.
- Optional: `instructions`, `is_favorite`.
- Indexes: `user_id`, `name`.

### recipe_ingredients

- Required: `id`, `recipe_id`, `food_item_id`, `servings`.
- Optional: `grams`.
- Indexes: `recipe_id`.

### diary_days

- Required: `id`, `user_id`, `local_date`.
- Optional: `notes`.
- Indexes: unique `user_id, local_date`.
- Source: local diary day is authoritative for day grouping.

### diary_entries

- Required: `id`, `user_id`, `diary_day_id`, `meal_slot`, `food_item_id`, `servings`.
- Optional: `logged_at`, `food_name_snapshot`, `calories_snapshot`, `protein_g_snapshot`, `carbs_g_snapshot`, `fat_g_snapshot`, `fiber_g_snapshot`, `sodium_mg_snapshot`.
- Indexes: `user_id, diary_day_id`, `meal_slot`, `food_item_id`.
- Sync: merge by UUID; snapshots preserve historical nutrition if provider data changes.

### water_logs

- Required: `id`, `user_id`, `local_date`, `amount_ml`.
- Optional: `logged_at`.
- Indexes: `user_id, local_date`.

## System

### sync_queue

- Required: `id`, `entity_type`, `entity_id`, `operation`, `payload_json`, `idempotency_key`, `status`, `attempt_count`.
- Optional: `last_error`, `next_retry_at`, `created_at`, `updated_at`.
- Indexes: `status`, `entity_type, entity_id`, unique `idempotency_key`.
- Local source of truth for pending writes.

## Date And Conflict Rules

- Diary entries belong to the user's local date at the time of logging.
- Workouts are grouped by start date even if they cross midnight.
- Profile/settings use last-write-wins.
- Workout set conflicts prefer non-null completed local data over blank remote updates.
- Derived records are recalculable and can be regenerated from source logs.
