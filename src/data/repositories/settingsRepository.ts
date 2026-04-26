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

type UserRow = {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: 'synced' | 'pending' | 'failed';
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
  displayName?: string | null;
  profile: UserProfile;
  settings: UserSettings;
  units: UnitPreferences;
  goals: GoalSettings;
}

export async function getProfileBundle(userId = DEMO_USER_ID): Promise<ProfileBundle> {
  const db = await getDatabase();
  const [user, profile, settings, units, goals] = await Promise.all([
    db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [userId]),
    db.getFirstAsync<ProfileRow>('SELECT * FROM user_profiles WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    db.getFirstAsync<SettingsRow>('SELECT * FROM user_settings WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    db.getFirstAsync<UnitsRow>('SELECT * FROM unit_preferences WHERE user_id = ? AND deleted_at IS NULL', [userId]),
    db.getFirstAsync<GoalsRow>('SELECT * FROM goal_settings WHERE user_id = ? AND deleted_at IS NULL', [userId]),
  ]);
  if (!user || !profile || !settings || !units || !goals) {
    throw new Error('Profile is not initialized');
  }
  return {
    displayName: user.display_name,
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
  patch: Partial<
    Pick<GoalSettings, 'goal' | 'activityLevel' | 'calorieTarget' | 'proteinTargetG' | 'carbTargetG' | 'fatTargetG' | 'waterTargetMl' | 'workoutsPerWeekTarget'>
  >,
  userId = DEMO_USER_ID,
): Promise<void> {
  const db = await getDatabase();
  const current = (await db.getFirstAsync<GoalsRow>('SELECT * FROM goal_settings WHERE user_id = ?', [userId]))!;
  const next = {
    goal: patch.goal ?? current.goal,
    activityLevel: patch.activityLevel ?? current.activity_level,
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
     SET goal = ?, activity_level = ?, calorie_target = ?, protein_target_g = ?, carb_target_g = ?, fat_target_g = ?, water_target_ml = ?, workouts_per_week_target = ?,
         updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE user_id = ?`,
    [
      next.goal,
      next.activityLevel,
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

export async function updateProfileSettings(
  patch: Partial<{ firstName: string; lastName: string; heightCm: number; currentWeightKg: number }>,
  userId = DEMO_USER_ID,
): Promise<void> {
  const db = await getDatabase();
  const [currentUser, currentProfile] = await Promise.all([
    db.getFirstAsync<UserRow>('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL', [userId]),
    db.getFirstAsync<ProfileRow>('SELECT * FROM user_profiles WHERE user_id = ? AND deleted_at IS NULL', [userId]),
  ]);

  if (!currentUser || !currentProfile) {
    throw new Error('Profile is not initialized');
  }

  const [existingFirstName, ...rest] = (currentUser.display_name ?? '').trim().split(/\s+/).filter(Boolean);
  const existingLastName = rest.join(' ');

  const firstName = patch.firstName === undefined ? existingFirstName ?? '' : patch.firstName.trim();
  const lastName = patch.lastName === undefined ? existingLastName : patch.lastName.trim();
  const displayName = `${firstName} ${lastName}`.trim();
  const heightCm = patch.heightCm ?? currentProfile.height_cm;
  const currentWeightKg = patch.currentWeightKg ?? currentProfile.current_weight_kg;
  const now = new Date().toISOString();

  await db.runAsync(
    `UPDATE users
     SET display_name = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ? AND deleted_at IS NULL`,
    [displayName.length ? displayName : null, now, userId],
  );
  await db.runAsync(
    `UPDATE user_profiles
     SET height_cm = ?, current_weight_kg = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE user_id = ? AND deleted_at IS NULL`,
    [heightCm, currentWeightKg, now, userId],
  );

  await enqueueSync('user', userId, 'update', { displayName: displayName.length ? displayName : null });
  await enqueueSync('user_profile', userId, 'update', { heightCm, currentWeightKg });
}

export async function updateUnitPreferences(
  patch: Partial<Pick<UnitPreferences, 'bodyWeightUnit' | 'loadUnit' | 'volumeUnit'>>,
  userId = DEMO_USER_ID,
): Promise<void> {
  const db = await getDatabase();
  const current = await db.getFirstAsync<UnitsRow>('SELECT * FROM unit_preferences WHERE user_id = ? AND deleted_at IS NULL', [userId]);
  if (!current) {
    throw new Error('Unit preferences are not initialized');
  }

  const next = {
    bodyWeightUnit: patch.bodyWeightUnit ?? current.body_weight_unit,
    loadUnit: patch.loadUnit ?? current.load_unit,
    volumeUnit: patch.volumeUnit ?? current.volume_unit,
    distanceUnit: current.distance_unit,
    energyUnit: current.energy_unit,
  };
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE unit_preferences
     SET body_weight_unit = ?, load_unit = ?, distance_unit = ?, volume_unit = ?, energy_unit = ?,
         updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE user_id = ? AND deleted_at IS NULL`,
    [next.bodyWeightUnit, next.loadUnit, next.distanceUnit, next.volumeUnit, next.energyUnit, now, userId],
  );
  await enqueueSync('unit_preferences', userId, 'update', next);
}

export async function getMealsPerDayTarget(userId = DEMO_USER_ID): Promise<number> {
  const db = await getDatabase();
  const key = `meals_per_day_target:${userId}`;
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_metadata WHERE key = ?', [key]);
  if (!row) {
    return 4;
  }

  const parsed = Number.parseInt(row.value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 4;
  }

  return parsed;
}

export async function updateMealsPerDayTarget(target: number, userId = DEMO_USER_ID): Promise<number> {
  const db = await getDatabase();
  const normalized = Math.max(1, Math.min(12, Math.round(target)));
  const key = `meals_per_day_target:${userId}`;
  await db.runAsync(
    `INSERT INTO app_metadata (key, value)
     VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, String(normalized)],
  );
  return normalized;
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
