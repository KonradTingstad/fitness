import { getDatabase } from '@/data/db/database';
import { DEMO_USER_ID } from '@/data/db/ids';
import { enqueueSync } from '@/data/sync/syncQueue';
import { GoalSettings, UnitPreferences, UserProfile, UserSettings } from '@/domain/models';
import { OnboardingForm } from '@/domain/validation/forms';

type ProfileRow = {
  id: string;
  user_id: string;
  age: number | null;
  sex: UserProfile['sex'] | null;
  height_cm: number;
  current_weight_kg: number;
  diet_preferences: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: UserProfile['syncStatus'];
  version: number;
};

type SettingsRow = {
  id: string;
  user_id: string;
  theme: UserSettings['theme'];
  notifications_enabled: number;
  rest_timer_default_seconds: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: UserSettings['syncStatus'];
  version: number;
};

type UnitsRow = {
  id: string;
  user_id: string;
  body_weight_unit: UnitPreferences['bodyWeightUnit'];
  load_unit: UnitPreferences['loadUnit'];
  distance_unit: UnitPreferences['distanceUnit'];
  volume_unit: UnitPreferences['volumeUnit'];
  energy_unit: UnitPreferences['energyUnit'];
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: UnitPreferences['syncStatus'];
  version: number;
};

type GoalsRow = {
  id: string;
  user_id: string;
  goal: GoalSettings['goal'];
  activity_level: GoalSettings['activityLevel'];
  workouts_per_week_target: number;
  calorie_target: number;
  protein_target_g: number;
  carb_target_g: number;
  fat_target_g: number;
  water_target_ml: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: GoalSettings['syncStatus'];
  version: number;
};

export interface ProfileBundle {
  profile: UserProfile;
  settings: UserSettings;
  units: UnitPreferences;
  goals: GoalSettings;
}

export async function getProfileBundle(userId = DEMO_USER_ID): Promise<ProfileBundle> {
  const db = await getDatabase();
  const [profile, settings, units, goals] = await Promise.all([
    db.getFirstAsync<ProfileRow>('SELECT * FROM user_profiles WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    db.getFirstAsync<SettingsRow>('SELECT * FROM user_settings WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    db.getFirstAsync<UnitsRow>('SELECT * FROM unit_preferences WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    db.getFirstAsync<GoalsRow>('SELECT * FROM goal_settings WHERE user_id = ? AND deleted_at IS NULL', [userId]),
  ]);
  if (!profile || !settings || !units || !goals) {
    throw new Error('Profile is not initialized');
  }
  return {
    profile: mapProfile(profile),
    settings: mapSettings(settings),
    units: mapUnits(units),
    goals: mapGoals(goals),
  };
}

export async function completeOnboarding(input: OnboardingForm, userId = DEMO_USER_ID): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE user_profiles
     SET height_cm = ?, current_weight_kg = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE user_id = ?`,
    [input.heightCm, input.currentWeightKg, now, userId],
  );
  await db.runAsync(
    `UPDATE goal_settings
     SET calorie_target = ?, protein_target_g = ?, workouts_per_week_target = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE user_id = ?`,
    [input.calorieTarget, input.proteinTargetG, input.workoutsPerWeekTarget, now, userId],
  );
  await enqueueSync('user_profile', userId, 'update', input);
}

export async function updateGoals(
  patch: Partial<Pick<GoalSettings, 'calorieTarget' | 'proteinTargetG' | 'carbTargetG' | 'fatTargetG' | 'waterTargetMl' | 'workoutsPerWeekTarget'>>,
  userId = DEMO_USER_ID,
): Promise<void> {
  const db = await getDatabase();
  const current = (await db.getFirstAsync<GoalsRow>('SELECT * FROM goal_settings WHERE user_id = ?', [userId]))!;
  const next = {
    calorieTarget: patch.calorieTarget ?? current.calorie_target,
    proteinTargetG: patch.proteinTargetG ?? current.protein_target_g,
    carbTargetG: patch.carbTargetG ?? current.carb_target_g,
    fatTargetG: patch.fatTargetG ?? current.fat_target_g,
    waterTargetMl: patch.waterTargetMl ?? current.water_target_ml,
    workoutsPerWeekTarget: patch.workoutsPerWeekTarget ?? current.workouts_per_week_target,
  };
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE goal_settings
     SET calorie_target = ?, protein_target_g = ?, carb_target_g = ?, fat_target_g = ?, water_target_ml = ?, workouts_per_week_target = ?,
         updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE user_id = ?`,
    [
      next.calorieTarget,
      next.proteinTargetG,
      next.carbTargetG,
      next.fatTargetG,
      next.waterTargetMl,
      next.workoutsPerWeekTarget,
      now,
      userId,
    ],
  );
  await enqueueSync('goal_settings', userId, 'update', next);
}

function mapProfile(row: ProfileRow): UserProfile {
  return {
    id: row.id,
    userId: row.user_id,
    age: row.age,
    sex: row.sex,
    heightCm: row.height_cm,
    currentWeightKg: row.current_weight_kg,
    dietPreferences: row.diet_preferences,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

function mapSettings(row: SettingsRow): UserSettings {
  return {
    id: row.id,
    userId: row.user_id,
    theme: row.theme,
    notificationsEnabled: Boolean(row.notifications_enabled),
    restTimerDefaultSeconds: row.rest_timer_default_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

function mapUnits(row: UnitsRow): UnitPreferences {
  return {
    id: row.id,
    userId: row.user_id,
    bodyWeightUnit: row.body_weight_unit,
    loadUnit: row.load_unit,
    distanceUnit: row.distance_unit,
    volumeUnit: row.volume_unit,
    energyUnit: row.energy_unit,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

function mapGoals(row: GoalsRow): GoalSettings {
  return {
    id: row.id,
    userId: row.user_id,
    goal: row.goal,
    activityLevel: row.activity_level,
    workoutsPerWeekTarget: row.workouts_per_week_target,
    calorieTarget: row.calorie_target,
    proteinTargetG: row.protein_target_g,
    carbTargetG: row.carb_target_g,
    fatTargetG: row.fat_target_g,
    waterTargetMl: row.water_target_ml,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}
