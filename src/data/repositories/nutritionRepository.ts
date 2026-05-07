import { getDatabase } from '@/data/db/database';
import { createId, DEMO_USER_ID } from '@/data/db/ids';
import { enqueueSync } from '@/data/sync/syncQueue';
import { isSupabaseConfigured, supabase } from '@/data/sync/supabase';
import { shiftLocalDate, toLocalDateKey } from '@/domain/calculations/dates';
import { calculateCalorieGoalStreak, sumDiaryEntries } from '@/domain/calculations/nutrition';
import { DEFAULT_CAFFEINE_TARGET_MG, getCaffeineTargetMg } from '@/data/repositories/settingsRepository';
import {
  DiaryDay,
  DiaryEntry,
  FoodBaseUnit,
  FoodItem,
  FoodItemType,
  MealSlot,
  NutritionBasis,
  NutritionTotals,
  Recipe,
  SavedMeal,
  SavedMealItem,
  ServingMode,
} from '@/domain/models';
import { CustomFoodForm } from '@/domain/validation/forms';

type FoodRow = {
  id: string;
  user_id: string | null;
  brand_id: string | null;
  brand_name: string | null;
  item_type: string | null;
  product_type: string | null;
  base_unit: string | null;
  nutrition_basis: string | null;
  serving_mode: string | null;
  serving_label: string | null;
  name: string;
  serving_size: number;
  serving_unit: string;
  grams_per_serving: number;
  package_size: string | null;
  package_size_value: number | null;
  package_unit: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  caffeine_mg_per_100ml: number | null;
  caffeine_mg_per_can: number | null;
  kj_per_100: number | null;
  calories_per_100: number | null;
  protein_per_100: number | null;
  carbs_per_100: number | null;
  sugar_per_100: number | null;
  fat_per_100: number | null;
  saturated_fat_per_100: number | null;
  fiber_per_100: number | null;
  salt_per_100: number | null;
  barcode: string | null;
  source_provider: FoodItem['sourceProvider'] | string;
  is_verified: number | boolean;
  is_custom: number | boolean;
};

type SupabaseFoodSearchRow = {
  id: string;
  name: string;
  brand_name: string | null;
  item_type?: string | null;
  product_type?: string | null;
  base_unit?: string | null;
  nutrition_basis?: string | null;
  serving_mode?: string | null;
  serving_label?: string | null;
  serving_size: number | null;
  serving_unit: string | null;
  grams_per_serving: number | null;
  package_size?: string | null;
  package_size_value?: number | null;
  package_unit?: string | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fiber_g: number | null;
  sugar_g?: number | null;
  saturated_fat_g?: number | null;
  sodium_mg: number | null;
  caffeine_mg_per_100ml?: number | null;
  caffeine_mg_per_can?: number | null;
  kj_per_100?: number | null;
  calories_per_100?: number | null;
  protein_per_100?: number | null;
  carbs_per_100?: number | null;
  sugar_per_100?: number | null;
  fat_per_100?: number | null;
  saturated_fat_per_100?: number | null;
  fiber_per_100?: number | null;
  salt_per_100?: number | null;
  barcode?: string | null;
  source_provider: string | null;
  is_verified: boolean;
  is_custom: boolean;
};

type DiaryEntryRow = {
  id: string;
  user_id: string;
  diary_day_id: string;
  meal_slot: MealSlot;
  food_item_id: string;
  servings: number;
  quantity_type: 'portion' | 'gram' | null;
  total_grams: number | null;
  total_calories: number | null;
  total_protein_g: number | null;
  total_carbs_g: number | null;
  total_fat_g: number | null;
  source_saved_meal_id: string | null;
  logged_at: string;
  food_name_snapshot: string;
  calories_snapshot: number;
  protein_g_snapshot: number;
  carbs_g_snapshot: number;
  fat_g_snapshot: number;
  fiber_g_snapshot: number | null;
  sodium_mg_snapshot: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: DiaryEntry['syncStatus'];
  version: number;
};

type DiaryDayRow = {
  id: string;
  user_id: string;
  local_date: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: DiaryDay['syncStatus'];
  version: number;
};

type CaffeineLogRow = {
  id: string;
  user_id: string;
  local_date: string;
  drink_name: string;
  caffeine_mg: number;
  amount_ml: number | null;
  consumed_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: 'synced' | 'pending' | 'failed';
  version: number;
};

type CaffeineDiaryEntryRow = {
  entry_id: string;
  logged_at: string;
  servings: number;
  quantity_type: 'portion' | 'gram' | null;
  total_grams: number | null;
  drink_name: string;
  serving_size: number;
  serving_unit: string;
  package_size: string | null;
  package_size_value: number | null;
  package_unit: string | null;
  source_provider: string | null;
  caffeine_mg_per_100ml: number | null;
  caffeine_mg_per_can: number | null;
  grams_per_serving: number;
};

type SupabaseCaffeineRow = {
  id: string;
  caffeine_mg_per_100ml: number | null;
  caffeine_mg_per_can: number | null;
};

export interface DiarySummary {
  day: DiaryDay;
  totals: NutritionTotals;
  byMeal: Record<MealSlot, DiaryEntry[]>;
}

export interface FoodSuggestion {
  food: FoodItem;
  totalLogs: number;
  commonMealSlot: MealSlot;
  lastLoggedAt: string;
}

export interface CaffeineDailySummary {
  localDate: string;
  totalCaffeineMg: number;
  goalCaffeineMg: number;
  lastLog: {
    id: string;
    drinkName: string;
    caffeineMg: number;
    consumedAt: string;
    source: 'diary' | 'legacy';
  } | null;
}

export type FoodSearchItemType = FoodItemType | 'all';

export type SavedMealItemInput = {
  foodItemId: string;
  servings: number;
  mealSlot?: MealSlot | null;
  food?: FoodItem;
  quantityType?: 'portion' | 'gram';
  totalGrams?: number;
  totalCalories?: number;
  totalProteinG?: number;
  totalCarbsG?: number;
  totalFatG?: number;
};

const CALORIE_STREAK_LOOKBACK_DAYS = 90;

const SUPABASE_SEARCH_SELECT_EXTENDED =
  'id, name, brand_name, item_type, product_type, base_unit, nutrition_basis, serving_mode, serving_label, serving_size, serving_unit, grams_per_serving, package_size, package_size_value, package_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g, sodium_mg, caffeine_mg_per_100ml, caffeine_mg_per_can, kj_per_100, calories_per_100, protein_per_100, carbs_per_100, sugar_per_100, fat_per_100, saturated_fat_per_100, fiber_per_100, salt_per_100, barcode, source_provider, is_verified, is_custom';
const SUPABASE_SEARCH_SELECT_LEGACY =
  'id, name, brand_name, serving_size, serving_unit, grams_per_serving, calories, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, source_provider, is_verified, is_custom';

function isSupabaseMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === '42703') return true;
  const message = String(error.message ?? '');
  return message.includes('column') && message.includes('does not exist');
}

function normalizeFoodItemType(value: unknown): FoodItemType {
  return value === 'drink' ? 'drink' : 'food';
}

function normalizeFoodBaseUnit(value: unknown, fallbackItemType: FoodItemType): FoodBaseUnit {
  if (value === 'ml') return 'ml';
  if (value === 'g') return 'g';
  return fallbackItemType === 'drink' ? 'ml' : 'g';
}

function normalizeNutritionBasis(value: unknown, baseUnit: FoodBaseUnit): NutritionBasis {
  if (value === 'per_100ml') return 'per_100ml';
  if (value === 'per_100g') return 'per_100g';
  return baseUnit === 'ml' ? 'per_100ml' : 'per_100g';
}

function normalizeServingMode(value: unknown, packageSize: number | null, servingLabel: string | null): ServingMode {
  if (value === 'fixed_package' || value === 'suggested_amount' || value === 'custom_amount') {
    return value;
  }
  if (Number.isFinite(packageSize) && (packageSize ?? 0) > 0) {
    return 'fixed_package';
  }
  if (servingLabel && servingLabel.trim().length) {
    return 'suggested_amount';
  }
  return 'custom_amount';
}

function parsePackageSizeLabel(rawValue: string | null | undefined): { size: number | null; unit: FoodBaseUnit | null } {
  if (!rawValue) return { size: null, unit: null };
  const normalized = String(rawValue).replace(/\u00a0/g, ' ').replace(/,/g, '.').toLowerCase();

  const multipackMatch = normalized.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)\b/);
  if (multipackMatch) {
    const singleSize = Number.parseFloat(multipackMatch[2]);
    const unitToken = multipackMatch[3];
    if (Number.isFinite(singleSize) && singleSize > 0) {
      if (unitToken === 'l') return { size: singleSize * 1000, unit: 'ml' };
      if (unitToken === 'cl') return { size: singleSize * 10, unit: 'ml' };
      if (unitToken === 'dl') return { size: singleSize * 100, unit: 'ml' };
      if (unitToken === 'ml') return { size: singleSize, unit: 'ml' };
      if (unitToken === 'kg') return { size: singleSize * 1000, unit: 'g' };
      if (unitToken === 'g') return { size: singleSize, unit: 'g' };
    }
  }

  const singleMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)\b/);
  if (!singleMatch) return { size: null, unit: null };
  const size = Number.parseFloat(singleMatch[1]);
  if (!Number.isFinite(size) || size <= 0) return { size: null, unit: null };
  const unitToken = singleMatch[2];
  if (unitToken === 'l') return { size: size * 1000, unit: 'ml' };
  if (unitToken === 'cl') return { size: size * 10, unit: 'ml' };
  if (unitToken === 'dl') return { size: size * 100, unit: 'ml' };
  if (unitToken === 'ml') return { size, unit: 'ml' };
  if (unitToken === 'kg') return { size: size * 1000, unit: 'g' };
  if (unitToken === 'g') return { size, unit: 'g' };
  return { size: null, unit: null };
}

function matchesFoodItemType(itemType: FoodItemType, filter: FoodSearchItemType): boolean {
  return filter === 'all' ? true : itemType === filter;
}

function roundTo(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function derivePer100(value: number | null | undefined, gramsPerServing: number): number | null {
  if (!Number.isFinite(value) || value == null) {
    return null;
  }
  if (!Number.isFinite(gramsPerServing) || gramsPerServing <= 0) {
    return null;
  }
  return roundTo((value * 100) / gramsPerServing, 3);
}

function deriveCustomFoodExtendedNutrition(form: CustomFoodForm): {
  kjPer100: number | null;
  caloriesPer100: number | null;
  proteinPer100: number | null;
  carbsPer100: number | null;
  sugarPer100: number | null;
  fatPer100: number | null;
  saturatedFatPer100: number | null;
  fiberPer100: number | null;
  saltPer100: number | null;
} {
  const gramsPerServing = Number.isFinite(form.gramsPerServing) && form.gramsPerServing > 0 ? form.gramsPerServing : 100;
  const caloriesPer100 = derivePer100(form.calories, gramsPerServing);
  const proteinPer100 = derivePer100(form.proteinG, gramsPerServing);
  const carbsPer100 = derivePer100(form.carbsG, gramsPerServing);
  const sugarPer100 = derivePer100(form.sugarG, gramsPerServing);
  const fatPer100 = derivePer100(form.fatG, gramsPerServing);
  const saturatedFatPer100 = derivePer100(form.saturatedFatG, gramsPerServing);
  const fiberPer100 = derivePer100(form.fiberG, gramsPerServing);
  const sodiumPer100 = derivePer100(form.sodiumMg, gramsPerServing);
  const saltPer100 = sodiumPer100 == null ? null : roundTo(sodiumPer100 / 400, 4);
  const kjPer100 = caloriesPer100 == null ? null : roundTo(caloriesPer100 * 4.184, 3);

  return {
    kjPer100,
    caloriesPer100,
    proteinPer100,
    carbsPer100,
    sugarPer100,
    fatPer100,
    saturatedFatPer100,
    fiberPer100,
    saltPer100,
  };
}

export async function getDiary(localDate = toLocalDateKey(), userId = DEMO_USER_ID): Promise<DiarySummary> {
  const db = await getDatabase();
  const dayId = await getOrCreateDiaryDay(localDate, userId);
  const [dayRow, entryRows, waterRow] = await Promise.all([
    db.getFirstAsync<DiaryDayRow>('SELECT * FROM diary_days WHERE id = ?', [dayId]),
    db.getAllAsync<DiaryEntryRow>(
      `SELECT * FROM diary_entries
       WHERE diary_day_id = ? AND deleted_at IS NULL
       ORDER BY meal_slot, logged_at ASC`,
      [dayId],
    ),
    db.getFirstAsync<{ total: number }>(
      'SELECT COALESCE(SUM(amount_ml), 0) as total FROM water_logs WHERE user_id = ? AND local_date = ? AND deleted_at IS NULL',
      [userId, localDate],
    ),
  ]);
  if (!dayRow) {
    throw new Error('Diary day not found');
  }
  const entries = entryRows.map(mapDiaryEntry);
  const byMeal: Record<MealSlot, DiaryEntry[]> = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
  };
  for (const entry of entries) {
    byMeal[entry.mealSlot].push(entry);
  }
  const day = mapDiaryDay(dayRow, entries, waterRow?.total ?? 0);
  return {
    day,
    totals: sumDiaryEntries(entries),
    byMeal,
  };
}

export async function getNutritionTotalsForDates(localDates: string[], userId = DEMO_USER_ID): Promise<Array<{ localDate: string; totals: NutritionTotals }>> {
  if (!localDates.length) {
    return [];
  }

  const db = await getDatabase();
  const uniqueDates = Array.from(new Set(localDates));
  const placeholders = uniqueDates.map(() => '?').join(', ');
  const rows = await db.getAllAsync<{
    local_date: string;
    calories: number;
    protein_g: number;
    carbs_g: number;
    fat_g: number;
    fiber_g: number;
    sodium_mg: number;
  }>(
    `SELECT
       d.local_date,
       COALESCE(SUM(COALESCE(e.total_calories, e.calories_snapshot * e.servings)), 0) AS calories,
       COALESCE(SUM(COALESCE(e.total_protein_g, e.protein_g_snapshot * e.servings)), 0) AS protein_g,
       COALESCE(SUM(COALESCE(e.total_carbs_g, e.carbs_g_snapshot * e.servings)), 0) AS carbs_g,
       COALESCE(SUM(COALESCE(e.total_fat_g, e.fat_g_snapshot * e.servings)), 0) AS fat_g,
       COALESCE(SUM(COALESCE(e.fiber_g_snapshot, 0) * e.servings), 0) AS fiber_g,
       COALESCE(SUM(COALESCE(e.sodium_mg_snapshot, 0) * e.servings), 0) AS sodium_mg
     FROM diary_days d
     LEFT JOIN diary_entries e ON e.diary_day_id = d.id AND e.deleted_at IS NULL
     WHERE d.user_id = ?
       AND d.deleted_at IS NULL
       AND d.local_date IN (${placeholders})
     GROUP BY d.local_date`,
    [userId, ...uniqueDates],
  );

  const totalsByDate = new Map<string, NutritionTotals>(
    rows.map((row) => [
      row.local_date,
      {
        calories: row.calories,
        proteinG: row.protein_g,
        carbsG: row.carbs_g,
        fatG: row.fat_g,
        fiberG: row.fiber_g,
        sodiumMg: row.sodium_mg,
      },
    ]),
  );

  return localDates.map((localDate) => ({
    localDate,
    totals:
      totalsByDate.get(localDate) ?? {
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
        fiberG: 0,
        sodiumMg: 0,
      },
  }));
}

export async function getCalorieGoalStreak(endLocalDate = toLocalDateKey(), userId = DEMO_USER_ID): Promise<number> {
  const db = await getDatabase();
  const lookbackStart = shiftLocalDate(endLocalDate, -(CALORIE_STREAK_LOOKBACK_DAYS - 1));
  const [goalRow, rows] = await Promise.all([
    db.getFirstAsync<{ calorie_target: number }>(
      `SELECT calorie_target
       FROM goal_settings
       WHERE user_id = ? AND deleted_at IS NULL
       LIMIT 1`,
      [userId],
    ),
    db.getAllAsync<{ local_date: string; calories: number }>(
      `SELECT
         d.local_date,
         COALESCE(SUM(e.calories_snapshot * e.servings), 0) as calories
       FROM diary_days d
       LEFT JOIN diary_entries e ON e.diary_day_id = d.id AND e.deleted_at IS NULL
       WHERE d.user_id = ?
         AND d.deleted_at IS NULL
         AND d.local_date BETWEEN ? AND ?
       GROUP BY d.local_date`,
      [userId, lookbackStart, endLocalDate],
    ),
  ]);

  const caloriesByDate = new Map(rows.map((row) => [row.local_date, row.calories]));
  return calculateCalorieGoalStreak(endLocalDate, goalRow?.calorie_target ?? 0, caloriesByDate, 0.1, CALORIE_STREAK_LOOKBACK_DAYS);
}

export async function searchFoodItems(query: string, itemType: FoodSearchItemType = 'food', userId = DEMO_USER_ID): Promise<FoodItem[]> {
  const db = await getDatabase();
  const search = `%${query.trim()}%`;
  const localRows = await db.getAllAsync<FoodRow>(
    `SELECT * FROM food_items
     WHERE deleted_at IS NULL
       AND (user_id IS NULL OR user_id = ?)
       AND (? = '%%' OR name LIKE ? OR brand_name LIKE ? OR barcode LIKE ?)
       AND (
         ? = 'all'
         OR (? = 'food' AND COALESCE(product_type, item_type, 'food') = 'food')
         OR (? = 'drink' AND COALESCE(product_type, item_type, 'food') = 'drink')
       )
     ORDER BY is_custom DESC, is_verified DESC, name ASC
     LIMIT 50`,
    [userId, search, search, search, search, itemType, itemType, itemType],
  );

  const localFoods = localRows.map(mapFood);
  const remoteFoods = await searchSupabaseFoodItems(query, itemType);
  if (remoteFoods.length) {
    try {
      await cacheFoodItemsInLocalDb(remoteFoods);
    } catch {
      // Remote search should still work even if local cache write fails.
    }
  }

  if (!remoteFoods.length) {
    return localFoods.filter((food) => matchesFoodItemType(food.itemType, itemType));
  }

  return mergeFoodSearchResults(localFoods, remoteFoods).filter((food) => matchesFoodItemType(food.itemType, itemType));
}

export async function getRecentFoods(itemType: FoodSearchItemType = 'food', userId = DEMO_USER_ID): Promise<FoodItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FoodRow>(
    `SELECT DISTINCT f.*
     FROM diary_entries e
     JOIN food_items f ON f.id = e.food_item_id
     WHERE e.user_id = ?
       AND e.deleted_at IS NULL
       AND (
         ? = 'all'
         OR (? = 'food' AND COALESCE(f.product_type, f.item_type, 'food') = 'food')
         OR (? = 'drink' AND COALESCE(f.product_type, f.item_type, 'food') = 'drink')
       )
     ORDER BY e.logged_at DESC
     LIMIT 10`,
    [userId, itemType, itemType, itemType],
  );
  return rows.map(mapFood);
}

export async function getFrequentlyLoggedFoods(itemType: FoodSearchItemType = 'food', userId = DEMO_USER_ID): Promise<FoodSuggestion[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FoodRow & { total_logs: number; common_meal_slot: MealSlot; last_logged_at: string }>(
    `SELECT
       f.*,
       COUNT(e.id) as total_logs,
       MAX(e.logged_at) as last_logged_at,
       (
         SELECT e2.meal_slot
         FROM diary_entries e2
         WHERE e2.user_id = ?
           AND e2.deleted_at IS NULL
           AND e2.food_item_id = f.id
         GROUP BY e2.meal_slot
         ORDER BY COUNT(e2.id) DESC, MAX(e2.logged_at) DESC
         LIMIT 1
       ) as common_meal_slot
     FROM diary_entries e
     JOIN food_items f ON f.id = e.food_item_id
     WHERE e.user_id = ?
       AND e.deleted_at IS NULL
       AND f.deleted_at IS NULL
       AND (
         ? = 'all'
         OR (? = 'food' AND COALESCE(f.product_type, f.item_type, 'food') = 'food')
         OR (? = 'drink' AND COALESCE(f.product_type, f.item_type, 'food') = 'drink')
       )
     GROUP BY f.id
     ORDER BY total_logs DESC, last_logged_at DESC
     LIMIT 8`,
    [userId, userId, itemType, itemType, itemType],
  );

  return rows.map((row) => ({
    food: mapFood(row),
    totalLogs: row.total_logs,
    commonMealSlot: row.common_meal_slot,
    lastLoggedAt: row.last_logged_at,
  }));
}

function resolveFoodBaseUnitFromRow(food: FoodRow): FoodBaseUnit {
  return normalizeFoodBaseUnit(food.base_unit, normalizeFoodItemType(food.product_type ?? food.item_type));
}

function resolveFoodNutritionBasisFromRow(food: FoodRow, baseUnit: FoodBaseUnit): NutritionBasis {
  return normalizeNutritionBasis(food.nutrition_basis, baseUnit);
}

function resolveAmountPerServingInBaseUnit(food: FoodRow, baseUnit: FoodBaseUnit): number | null {
  const servingSize = Number.isFinite(food.serving_size) && food.serving_size > 0 ? food.serving_size : 0;
  const servingUnit = String(food.serving_unit ?? '')
    .trim()
    .toLowerCase();
  if (servingSize > 0) {
    if (baseUnit === 'ml') {
      const servingMl = toMilliliters(servingSize, servingUnit);
      if (Number.isFinite(servingMl) && (servingMl ?? 0) > 0) {
        return servingMl!;
      }
      if (servingUnit === 'g' || servingUnit === 'gram' || servingUnit === 'grams') {
        return servingSize;
      }
    } else if (baseUnit === 'g') {
      if (servingUnit === 'g' || servingUnit === 'gram' || servingUnit === 'grams') {
        return servingSize;
      }
      if (servingUnit === 'kg' || servingUnit === 'kilogram' || servingUnit === 'kilograms') {
        return servingSize * 1000;
      }
    }
  }
  const gramsPerServing = Number.isFinite(food.grams_per_serving) && food.grams_per_serving > 0 ? food.grams_per_serving : 0;
  return gramsPerServing > 0 ? gramsPerServing : null;
}

function resolveFoodAmountInBaseUnitForEntry(
  food: FoodRow,
  servings: number,
  quantityType: 'portion' | 'gram',
  totalGrams: number,
  baseUnit: FoodBaseUnit,
): number | null {
  if (quantityType === 'gram' && Number.isFinite(totalGrams) && totalGrams > 0) {
    return totalGrams;
  }
  const amountPerServing = resolveAmountPerServingInBaseUnit(food, baseUnit);
  if (Number.isFinite(amountPerServing) && (amountPerServing ?? 0) > 0) {
    return servings * amountPerServing!;
  }
  return null;
}

function resolvePer100FromRow(
  per100Value: number | null,
  perServingValue: number,
  amountPerServingInBaseUnit: number | null,
): number | null {
  if (Number.isFinite(per100Value) && per100Value != null) {
    return per100Value;
  }
  if (!Number.isFinite(perServingValue)) {
    return null;
  }
  if (!Number.isFinite(amountPerServingInBaseUnit) || (amountPerServingInBaseUnit ?? 0) <= 0) {
    return null;
  }
  return (perServingValue * 100) / amountPerServingInBaseUnit!;
}

export async function addDiaryEntry(input: {
  localDate: string;
  mealSlot: MealSlot;
  foodItemId: string;
  servings: number;
  food?: FoodItem;
  quantityType?: 'portion' | 'gram';
  totalGrams?: number;
  totalCalories?: number;
  totalProteinG?: number;
  totalCarbsG?: number;
  totalFatG?: number;
  sourceSavedMealId?: string | null;
  userId?: string;
}): Promise<string> {
  const db = await getDatabase();
  const userId = input.userId ?? DEMO_USER_ID;
  const dayId = await getOrCreateDiaryDay(input.localDate, userId);
  let food = await db.getFirstAsync<FoodRow>('SELECT * FROM food_items WHERE id = ?', [input.foodItemId]);
  if (!food && input.food) {
    await cacheFoodItemsInLocalDb([input.food]);
    food = await db.getFirstAsync<FoodRow>('SELECT * FROM food_items WHERE id = ?', [input.foodItemId]);
  }
  if (!food) {
    throw new Error('Food not found');
  }
  if (!Number.isFinite(input.servings) || input.servings <= 0) {
    throw new Error('Servings must be greater than zero.');
  }

  const servings = input.servings;
  const quantityType = input.quantityType ?? 'portion';
  const gramsPerServing = Number.isFinite(food.grams_per_serving) && food.grams_per_serving > 0 ? food.grams_per_serving : 100;
  const totalGrams = Number.isFinite(input.totalGrams) && (input.totalGrams as number) > 0 ? (input.totalGrams as number) : servings * gramsPerServing;

  const baseUnit = resolveFoodBaseUnitFromRow(food);
  const nutritionBasis = resolveFoodNutritionBasisFromRow(food, baseUnit);
  const amountPerServingInBaseUnit = resolveAmountPerServingInBaseUnit(food, baseUnit);
  const amountInBaseUnit = resolveFoodAmountInBaseUnitForEntry(food, servings, quantityType, totalGrams, baseUnit);
  const amountFactor = Number.isFinite(amountInBaseUnit) && (amountInBaseUnit ?? 0) > 0 ? amountInBaseUnit! / 100 : null;

  const caloriesPer100 = resolvePer100FromRow(food.calories_per_100, food.calories, amountPerServingInBaseUnit);
  const proteinPer100 = resolvePer100FromRow(food.protein_per_100, food.protein_g, amountPerServingInBaseUnit);
  const carbsPer100 = resolvePer100FromRow(food.carbs_per_100, food.carbs_g, amountPerServingInBaseUnit);
  const fatPer100 = resolvePer100FromRow(food.fat_per_100, food.fat_g, amountPerServingInBaseUnit);

  const computedCaloriesFromBasis =
    nutritionBasis && amountFactor != null && caloriesPer100 != null ? Math.max(0, caloriesPer100 * amountFactor) : null;
  const computedProteinFromBasis =
    nutritionBasis && amountFactor != null && proteinPer100 != null ? Math.max(0, proteinPer100 * amountFactor) : null;
  const computedCarbsFromBasis =
    nutritionBasis && amountFactor != null && carbsPer100 != null ? Math.max(0, carbsPer100 * amountFactor) : null;
  const computedFatFromBasis =
    nutritionBasis && amountFactor != null && fatPer100 != null ? Math.max(0, fatPer100 * amountFactor) : null;

  const totalCalories = Number.isFinite(input.totalCalories) && (input.totalCalories as number) >= 0
    ? (input.totalCalories as number)
    : computedCaloriesFromBasis != null
      ? Math.round(computedCaloriesFromBasis)
      : food.calories * servings;
  const totalProteinG = Number.isFinite(input.totalProteinG) && (input.totalProteinG as number) >= 0
    ? (input.totalProteinG as number)
    : computedProteinFromBasis != null
      ? roundTo(computedProteinFromBasis, 3)
      : food.protein_g * servings;
  const totalCarbsG = Number.isFinite(input.totalCarbsG) && (input.totalCarbsG as number) >= 0
    ? (input.totalCarbsG as number)
    : computedCarbsFromBasis != null
      ? roundTo(computedCarbsFromBasis, 3)
      : food.carbs_g * servings;
  const totalFatG = Number.isFinite(input.totalFatG) && (input.totalFatG as number) >= 0
    ? (input.totalFatG as number)
    : computedFatFromBasis != null
      ? roundTo(computedFatFromBasis, 3)
      : food.fat_g * servings;

  const id = createId('entry');
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO diary_entries
    (id, user_id, diary_day_id, meal_slot, food_item_id, servings, quantity_type, total_grams, total_calories, total_protein_g, total_carbs_g, total_fat_g, source_saved_meal_id, logged_at, food_name_snapshot, calories_snapshot, protein_g_snapshot, carbs_g_snapshot, fat_g_snapshot, fiber_g_snapshot, sodium_mg_snapshot, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      dayId,
      input.mealSlot,
      input.foodItemId,
      servings,
      quantityType,
      totalGrams,
      totalCalories,
      totalProteinG,
      totalCarbsG,
      totalFatG,
      input.sourceSavedMealId ?? null,
      now,
      food.name,
      food.calories,
      food.protein_g,
      food.carbs_g,
      food.fat_g,
      food.fiber_g,
      food.sodium_mg,
      now,
      now,
      null,
      'pending',
      1,
    ],
  );
  await enqueueSync('diary_entry', id, 'insert', {
    localDate: input.localDate,
    mealSlot: input.mealSlot,
    foodItemId: input.foodItemId,
    servings,
    quantityType,
    totalGrams,
    totalCalories,
    totalProteinG,
    totalCarbsG,
    totalFatG,
    sourceSavedMealId: input.sourceSavedMealId ?? null,
  });
  return id;
}

export async function updateDiaryEntryServings(id: string, servings: number): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE diary_entries
     SET servings = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ?`,
    [servings, now, id],
  );
  await enqueueSync('diary_entry', id, 'update', { servings });
}

export async function deleteDiaryEntry(id: string): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE diary_entries
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ?`,
    [now, now, id],
  );
  await enqueueSync('diary_entry', id, 'delete', { id });
}

export async function addWater(amountMl: number, localDate = toLocalDateKey(), userId = DEMO_USER_ID): Promise<void> {
  const db = await getDatabase();
  const id = createId('water');
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO water_logs
    (id, user_id, local_date, amount_ml, logged_at, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, localDate, amountMl, now, now, now, null, 'pending', 1],
  );
  await enqueueSync('water_log', id, 'insert', { localDate, amountMl });
}

function resolveCaffeineFromDiaryRow(row: CaffeineDiaryEntryRow): number {
  const caffeinePer100Ml = resolveCaffeinePer100MlFromDiaryRow(row);
  const amountMl = resolveDiaryDrinkAmountMl(row);
  if (caffeinePer100Ml > 0 && Number.isFinite(amountMl) && (amountMl ?? 0) > 0) {
    return Math.max(0, (caffeinePer100Ml * amountMl!) / 100);
  }
  return resolveLegacyCaffeineFromDiaryRow(row);
}

function resolveCaffeinePer100MlFromDiaryRow(row: CaffeineDiaryEntryRow): number {
  const directPer100Ml = Number.isFinite(row.caffeine_mg_per_100ml) ? Math.max(0, row.caffeine_mg_per_100ml ?? 0) : 0;
  const caffeinePerServing = Number.isFinite(row.caffeine_mg_per_can) ? Math.max(0, row.caffeine_mg_per_can ?? 0) : 0;
  const servingVolumeMl = resolveDiaryDrinkServingVolumeMl(row);
  const hasServingVolume = Number.isFinite(servingVolumeMl) && (servingVolumeMl ?? 0) > 0;
  const derivedFromPerServing =
    caffeinePerServing > 0 && hasServingVolume
      ? (caffeinePerServing * 100) / servingVolumeMl!
      : null;

  if (directPer100Ml > 0) {
    // Handle legacy rows where per-can caffeine was stored in the per-100ml field.
    if (hasServingVolume && servingVolumeMl! >= 180) {
      if (caffeinePerServing > 0 && Math.abs(directPer100Ml - caffeinePerServing) <= 1 && derivedFromPerServing != null) {
        return Math.max(0, derivedFromPerServing);
      }
      if (directPer100Ml > 80) {
        const normalizedFromLikelyPerCan = (directPer100Ml * 100) / servingVolumeMl!;
        if (Number.isFinite(normalizedFromLikelyPerCan) && normalizedFromLikelyPerCan > 0 && normalizedFromLikelyPerCan <= 80) {
          return normalizedFromLikelyPerCan;
        }
      }
    }
    if (directPer100Ml > 80) {
      const inferredVolume = inferLikelyDrinkVolumeMlFromDiaryRow(row, directPer100Ml);
      if (Number.isFinite(inferredVolume) && (inferredVolume ?? 0) > 0) {
        const normalizedFromLikelyPerCan = (directPer100Ml * 100) / inferredVolume!;
        if (Number.isFinite(normalizedFromLikelyPerCan) && normalizedFromLikelyPerCan > 0 && normalizedFromLikelyPerCan <= 80) {
          return normalizedFromLikelyPerCan;
        }
      }
    }
    return directPer100Ml;
  }

  if (derivedFromPerServing != null) {
    return Math.max(0, derivedFromPerServing);
  }
  return 0;
}

function resolveLegacyCaffeineFromDiaryRow(row: CaffeineDiaryEntryRow): number {
  const caffeinePerServing = Number.isFinite(row.caffeine_mg_per_can) ? Math.max(0, row.caffeine_mg_per_can ?? 0) : 0;
  if (caffeinePerServing <= 0) {
    return 0;
  }
  const amountMl = resolveDiaryDrinkAmountMl(row);
  const servingVolumeMl = resolveDiaryDrinkServingVolumeMl(row);
  if (Number.isFinite(amountMl) && (amountMl ?? 0) > 0 && Number.isFinite(servingVolumeMl) && (servingVolumeMl ?? 0) > 0) {
    return Math.max(0, caffeinePerServing * (amountMl! / servingVolumeMl!));
  }
  const gramsPerServing = Number.isFinite(row.grams_per_serving) && row.grams_per_serving > 0 ? row.grams_per_serving : 0;
  const totalGrams = Number.isFinite(row.total_grams) && (row.total_grams ?? 0) > 0 ? row.total_grams ?? 0 : 0;
  const isGramEntry = row.quantity_type === 'gram' && gramsPerServing > 0 && totalGrams > 0;
  const servingFactor = isGramEntry ? totalGrams / gramsPerServing : Math.max(0, row.servings);
  return Math.max(0, caffeinePerServing * servingFactor);
}

function toMilliliters(value: number, unitRaw: string): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  const unit = String(unitRaw ?? '')
    .trim()
    .toLowerCase();
  if (!unit.length) {
    return null;
  }
  if (unit === 'ml' || unit === 'milliliter' || unit === 'milliliters') {
    return value;
  }
  if (unit === 'l' || unit === 'liter' || unit === 'litre' || unit === 'liters' || unit === 'litres') {
    return value * 1000;
  }
  if (unit === 'cl' || unit === 'centiliter' || unit === 'centilitre') {
    return value * 10;
  }
  if (unit === 'dl' || unit === 'deciliter' || unit === 'decilitre') {
    return value * 100;
  }
  return null;
}

function resolveDiaryDrinkAmountMl(row: CaffeineDiaryEntryRow): number | null {
  const totalGrams = Number.isFinite(row.total_grams) && (row.total_grams ?? 0) > 0 ? row.total_grams ?? 0 : 0;
  if (row.quantity_type === 'gram' && totalGrams > 0) {
    // Legacy drink entries track volume through grams; treat as ml-equivalent for caffeine math.
    return totalGrams;
  }

  const servings = Number.isFinite(row.servings) && row.servings > 0 ? row.servings : 0;
  if (servings <= 0) {
    return null;
  }

  const servingVolumeMl = resolveDiaryDrinkServingVolumeMl(row);
  if (Number.isFinite(servingVolumeMl) && (servingVolumeMl ?? 0) > 0) {
    return servings * servingVolumeMl!;
  }

  const servingSize = Number.isFinite(row.serving_size) && row.serving_size > 0 ? row.serving_size : 0;
  if (servingSize > 0) {
    const servingSizeMl = toMilliliters(servingSize, row.serving_unit);
    if (Number.isFinite(servingSizeMl) && (servingSizeMl ?? 0) > 0) {
      return servings * servingSizeMl!;
    }

    const servingUnit = String(row.serving_unit ?? '').trim().toLowerCase();
    if (servingUnit === 'g' || servingUnit === 'gram' || servingUnit === 'grams') {
      return servings * servingSize;
    }
  }

  const gramsPerServing = Number.isFinite(row.grams_per_serving) && row.grams_per_serving > 0 ? row.grams_per_serving : 0;
  return gramsPerServing > 0 ? servings * gramsPerServing : null;
}

function resolveDiaryDrinkServingVolumeMl(row: CaffeineDiaryEntryRow): number | null {
  if (Number.isFinite(row.package_size_value) && (row.package_size_value ?? 0) > 0) {
    const unit = String(row.package_unit ?? '')
      .trim()
      .toLowerCase();
    if (unit === 'ml') {
      return row.package_size_value ?? null;
    }
    if (unit === 'g' || unit === 'gram' || unit === 'grams') {
      return row.package_size_value ?? null;
    }
  }

  const parsedPackage = parsePackageSizeLabel(row.package_size ?? null);
  if (Number.isFinite(parsedPackage.size) && (parsedPackage.size ?? 0) > 0 && parsedPackage.unit != null) {
    if (parsedPackage.unit === 'ml' || parsedPackage.unit === 'g') {
      return parsedPackage.size ?? null;
    }
  }

  const servingSize = Number.isFinite(row.serving_size) && row.serving_size > 0 ? row.serving_size : 0;
  if (servingSize > 0) {
    if (servingSize <= 120) {
      const directPer100Ml = Number.isFinite(row.caffeine_mg_per_100ml) ? Math.max(0, row.caffeine_mg_per_100ml ?? 0) : 0;
      const inferredVolume = inferLikelyDrinkVolumeMlFromDiaryRow(row, directPer100Ml);
      if (Number.isFinite(inferredVolume) && (inferredVolume ?? 0) > 0 && inferredVolume! > servingSize) {
        return inferredVolume!;
      }
    }
    const servingSizeMl = toMilliliters(servingSize, row.serving_unit);
    if (Number.isFinite(servingSizeMl) && (servingSizeMl ?? 0) > 0) {
      return servingSizeMl!;
    }

    const servingUnit = String(row.serving_unit ?? '').trim().toLowerCase();
    if (servingUnit === 'g' || servingUnit === 'gram' || servingUnit === 'grams') {
      return servingSize;
    }
  }

  const gramsPerServing = Number.isFinite(row.grams_per_serving) && row.grams_per_serving > 0 ? row.grams_per_serving : 0;
  return gramsPerServing > 0 ? gramsPerServing : null;
}

function inferLikelyDrinkVolumeMlFromDiaryRow(row: CaffeineDiaryEntryRow, caffeinePerCanLike: number): number | null {
  if (!Number.isFinite(caffeinePerCanLike) || caffeinePerCanLike <= 0) {
    return null;
  }
  if (caffeinePerCanLike <= 80) {
    return null;
  }
  const sourceProvider = String(row.source_provider ?? '').trim().toLowerCase();
  // Keep this fallback scoped to imported grocery drinks where per-can values are common.
  if (sourceProvider && sourceProvider !== 'oda_private_snapshot' && sourceProvider !== 'seed') {
    return null;
  }

  const drinkName = String(row.drink_name ?? '').toLowerCase();
  const looksLikeEnergyDrink = /\b(monster|red\s*bull|battery|burn|rockstar|energy|energidrikk)\b/.test(drinkName);
  if (!looksLikeEnergyDrink) {
    return null;
  }

  if (caffeinePerCanLike >= 140 && caffeinePerCanLike <= 260) return 500;
  if (caffeinePerCanLike >= 90 && caffeinePerCanLike < 140) return 330;
  if (caffeinePerCanLike > 80 && caffeinePerCanLike < 90) return 250;
  return null;
}

async function backfillMissingDrinkCaffeineForDate(localDate: string, userId: string): Promise<void> {
  const supabaseClient = supabase;
  if (!isSupabaseConfigured || !supabaseClient) {
    return;
  }

  const db = await getDatabase();
  const missingDrinkRows = await db.getAllAsync<{ food_item_id: string }>(
    `SELECT DISTINCT f.id as food_item_id
     FROM diary_days d
     JOIN diary_entries e ON e.diary_day_id = d.id AND e.deleted_at IS NULL
     JOIN food_items f ON f.id = e.food_item_id AND f.deleted_at IS NULL
     WHERE d.user_id = ?
       AND d.local_date = ?
       AND d.deleted_at IS NULL
       AND COALESCE(f.product_type, f.item_type, 'food') = 'drink'
       AND COALESCE(f.caffeine_mg_per_100ml, 0) <= 0`,
    [userId, localDate],
  );
  if (!missingDrinkRows.length) {
    return;
  }

  const missingFoodIds = Array.from(
    new Set(
      missingDrinkRows
        .map((row) => row.food_item_id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  );
  if (!missingFoodIds.length) {
    return;
  }

  const now = new Date().toISOString();
  const chunkSize = 100;
  for (let offset = 0; offset < missingFoodIds.length; offset += chunkSize) {
    const chunkIds = missingFoodIds.slice(offset, offset + chunkSize);
    const { data, error } = await supabaseClient
      .from('food_items')
      .select('id, caffeine_mg_per_100ml, caffeine_mg_per_can')
      .in('id', chunkIds)
      .is('deleted_at', null);
    if (error || !Array.isArray(data)) {
      continue;
    }

    for (const row of data as SupabaseCaffeineRow[]) {
      const caffeine = row.caffeine_mg_per_100ml;
      if (!Number.isFinite(caffeine) || (caffeine ?? 0) <= 0) {
        continue;
      }
      await db.runAsync(
        `UPDATE food_items
         SET caffeine_mg_per_100ml = ?, updated_at = ?
         WHERE id = ?`,
        [caffeine, now, row.id],
      );
    }
  }
}

export async function getDailyCaffeineSummary(localDate = toLocalDateKey(), userId = DEMO_USER_ID): Promise<CaffeineDailySummary> {
  await backfillMissingDrinkCaffeineForDate(localDate, userId);
  const db = await getDatabase();
  const [diaryRows, legacyRows, goalCaffeineMg] = await Promise.all([
    db.getAllAsync<CaffeineDiaryEntryRow>(
      `SELECT
         e.id as entry_id,
         e.logged_at,
         e.servings,
         e.quantity_type,
         e.total_grams,
         f.name as drink_name,
         f.serving_size,
         f.serving_unit,
         f.package_size,
         f.package_size_value,
         f.package_unit,
         f.source_provider,
         f.caffeine_mg_per_100ml,
         f.caffeine_mg_per_can,
         f.grams_per_serving
       FROM diary_days d
       JOIN diary_entries e ON e.diary_day_id = d.id AND e.deleted_at IS NULL
       JOIN food_items f ON f.id = e.food_item_id AND f.deleted_at IS NULL
       WHERE d.user_id = ?
         AND d.local_date = ?
         AND d.deleted_at IS NULL
         AND (COALESCE(f.caffeine_mg_per_100ml, 0) > 0 OR COALESCE(f.caffeine_mg_per_can, 0) > 0)
       ORDER BY e.logged_at DESC`,
      [userId, localDate],
    ),
    db.getAllAsync<CaffeineLogRow>(
      `SELECT *
       FROM caffeine_logs
       WHERE user_id = ? AND local_date = ? AND deleted_at IS NULL
       ORDER BY consumed_at DESC`,
      [userId, localDate],
    ),
    getCaffeineTargetMg(userId).catch(() => DEFAULT_CAFFEINE_TARGET_MG),
  ]);

  const totalDiaryCaffeineMg = diaryRows.reduce((sum, row) => sum + resolveCaffeineFromDiaryRow(row), 0);
  const totalLegacyCaffeineMg = legacyRows.reduce((sum, row) => sum + Math.max(0, row.caffeine_mg), 0);
  const totalCaffeineMg = Math.round(totalDiaryCaffeineMg + totalLegacyCaffeineMg);

  const latestDiary = diaryRows[0];
  const latestLegacy = legacyRows[0];
  const latestDiaryAt = latestDiary?.logged_at ? new Date(latestDiary.logged_at).getTime() : 0;
  const latestLegacyAt = latestLegacy?.consumed_at ? new Date(latestLegacy.consumed_at).getTime() : 0;
  const latestFromDiary = latestDiaryAt >= latestLegacyAt;

  return {
    localDate,
    totalCaffeineMg,
    goalCaffeineMg: goalCaffeineMg > 0 ? goalCaffeineMg : DEFAULT_CAFFEINE_TARGET_MG,
    lastLog:
      latestDiary || latestLegacy
        ? latestFromDiary && latestDiary
          ? {
              id: latestDiary.entry_id,
              drinkName: latestDiary.drink_name,
              caffeineMg: Math.round(resolveCaffeineFromDiaryRow(latestDiary)),
              consumedAt: latestDiary.logged_at,
              source: 'diary',
            }
          : latestLegacy
            ? {
                id: latestLegacy.id,
                drinkName: latestLegacy.drink_name,
                caffeineMg: Math.round(Math.max(0, latestLegacy.caffeine_mg)),
                consumedAt: latestLegacy.consumed_at,
                source: 'legacy',
              }
            : null
        : null,
  };
}

async function ensureManualCaffeineDrinkFood(
  drinkName: string,
  caffeineMg: number,
  userId: string,
): Promise<{ id: string }> {
  const db = await getDatabase();
  const normalizedName = drinkName.trim();
  const normalizedCaffeineMgPer100Ml = Math.round(Math.max(0, caffeineMg));
  const existing = await db.getFirstAsync<FoodRow>(
    `SELECT *
     FROM food_items
     WHERE user_id = ?
       AND COALESCE(product_type, item_type, 'food') = 'drink'
       AND is_custom = 1
       AND deleted_at IS NULL
       AND LOWER(name) = LOWER(?)
       AND (
         CAST(ROUND(COALESCE(caffeine_mg_per_100ml, 0), 0) AS INTEGER) = ?
         OR CAST(ROUND(COALESCE(caffeine_mg_per_can, 0), 0) AS INTEGER) = ?
       )
     ORDER BY updated_at DESC
     LIMIT 1`,
    [userId, normalizedName, normalizedCaffeineMgPer100Ml, normalizedCaffeineMgPer100Ml],
  );

  if (!existing) {
    const form: CustomFoodForm = {
      name: normalizedName,
      brandName: undefined,
      servingSize: 100,
      servingUnit: 'ml',
      gramsPerServing: 100,
      calories: 0,
      proteinG: 0,
      carbsG: 0,
      fatG: 0,
      fiberG: 0,
      sugarG: 0,
      saturatedFatG: 0,
      sodiumMg: 0,
      caffeineMgPer100Ml: normalizedCaffeineMgPer100Ml,
      barcode: undefined,
    };
    const id = await createCustomFood(form, userId, 'drink');
    return { id };
  }
  return { id: existing.id };
}

export async function logManualCaffeineDrink(
  input: {
    localDate: string;
    drinkName: string;
    caffeineMg: number;
    mealSlot?: MealSlot;
  },
  userId = DEMO_USER_ID,
): Promise<string> {
  const drinkName = input.drinkName.trim();
  if (!drinkName.length) {
    throw new Error('Drink name is required.');
  }
  if (!Number.isFinite(input.caffeineMg) || input.caffeineMg <= 0) {
    throw new Error('Caffeine amount must be greater than zero.');
  }
  const drinkFood = await ensureManualCaffeineDrinkFood(drinkName, input.caffeineMg, userId);
  return addDiaryEntry({
    localDate: input.localDate,
    mealSlot: input.mealSlot ?? 'snacks',
    foodItemId: drinkFood.id,
    servings: 1,
    userId,
  });
}

export async function addCaffeineLog(
  input: { drinkName: string; caffeineMg: number; amountMl?: number | null; consumedAt?: string | null },
  localDate = toLocalDateKey(),
  userId = DEMO_USER_ID,
): Promise<string> {
  const drinkName = input.drinkName.trim();
  if (!drinkName.length) {
    throw new Error('Drink name is required.');
  }
  if (!Number.isFinite(input.caffeineMg) || input.caffeineMg <= 0) {
    throw new Error('Caffeine amount must be greater than zero.');
  }

  const db = await getDatabase();
  const id = createId('caffeine');
  const now = new Date().toISOString();
  const caffeineMg = Math.round(Math.max(0, input.caffeineMg));
  const amountMl = input.amountMl != null && Number.isFinite(input.amountMl) && input.amountMl > 0 ? input.amountMl : null;
  const consumedAt = input.consumedAt ?? now;

  await db.runAsync(
    `INSERT INTO caffeine_logs
    (id, user_id, local_date, drink_name, caffeine_mg, amount_ml, consumed_at, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, localDate, drinkName, caffeineMg, amountMl, consumedAt, now, now, null, 'pending', 1],
  );
  await enqueueSync('caffeine_log', id, 'insert', { localDate, drinkName, caffeineMg, amountMl, consumedAt });
  return id;
}

export async function deleteLatestCaffeineLog(localDate = toLocalDateKey(), userId = DEMO_USER_ID): Promise<boolean> {
  const db = await getDatabase();
  const latestDiary = await db.getFirstAsync<{ id: string }>(
    `SELECT e.id
     FROM diary_days d
     JOIN diary_entries e ON e.diary_day_id = d.id AND e.deleted_at IS NULL
     JOIN food_items f ON f.id = e.food_item_id AND f.deleted_at IS NULL
     WHERE d.user_id = ?
       AND d.local_date = ?
       AND d.deleted_at IS NULL
       AND (COALESCE(f.caffeine_mg_per_100ml, 0) > 0 OR COALESCE(f.caffeine_mg_per_can, 0) > 0)
     ORDER BY e.logged_at DESC
     LIMIT 1`,
    [userId, localDate],
  );
  const latestLegacy = await db.getFirstAsync<{ id: string; consumed_at: string }>(
    `SELECT id, consumed_at
     FROM caffeine_logs
     WHERE user_id = ? AND local_date = ? AND deleted_at IS NULL
     ORDER BY consumed_at DESC
     LIMIT 1`,
    [userId, localDate],
  );
  if (!latestDiary?.id && !latestLegacy?.id) {
    return false;
  }

  if (latestDiary?.id && !latestLegacy?.id) {
    await deleteDiaryEntry(latestDiary.id);
    return true;
  }
  if (!latestDiary?.id && latestLegacy?.id) {
    const now = new Date().toISOString();
    await db.runAsync(
      `UPDATE caffeine_logs
       SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
       WHERE id = ?`,
      [now, now, latestLegacy.id],
    );
    await enqueueSync('caffeine_log', latestLegacy.id, 'delete', { id: latestLegacy.id });
    return true;
  }

  const latestDiaryAt = await db.getFirstAsync<{ logged_at: string }>(
    `SELECT logged_at
     FROM diary_entries
     WHERE id = ?`,
    [latestDiary!.id],
  );
  const diaryTime = latestDiaryAt?.logged_at ? new Date(latestDiaryAt.logged_at).getTime() : 0;
  const legacyTime = latestLegacy?.consumed_at ? new Date(latestLegacy.consumed_at).getTime() : 0;
  if (diaryTime >= legacyTime) {
    await deleteDiaryEntry(latestDiary!.id);
    return true;
  }

  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE caffeine_logs
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ?`,
    [now, now, latestLegacy!.id],
  );
  await enqueueSync('caffeine_log', latestLegacy!.id, 'delete', { id: latestLegacy!.id });
  return true;
}

export async function createCustomFood(form: CustomFoodForm, userId = DEMO_USER_ID, itemType: FoodItemType = 'food'): Promise<string> {
  const db = await getDatabase();
  const id = createId('food');
  const customId = createId('custom_food');
  const now = new Date().toISOString();
  const derived = deriveCustomFoodExtendedNutrition(form);
  const baseUnit: FoodBaseUnit = itemType === 'drink' ? 'ml' : 'g';
  const nutritionBasis: NutritionBasis = baseUnit === 'ml' ? 'per_100ml' : 'per_100g';
  const servingMode: ServingMode = 'custom_amount';

  await db.runAsync(
    `INSERT INTO food_items
    (id, user_id, brand_id, brand_name, item_type, product_type, base_unit, nutrition_basis, serving_mode, serving_label, name, serving_size, serving_unit, grams_per_serving, package_size, package_size_value, package_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g, sodium_mg, caffeine_mg_per_100ml, caffeine_mg_per_can, kj_per_100, calories_per_100, protein_per_100, carbs_per_100, sugar_per_100, fat_per_100, saturated_fat_per_100, fiber_per_100, salt_per_100, barcode, source_provider, is_verified, is_custom, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      null,
      form.brandName ?? null,
      itemType,
      itemType,
      baseUnit,
      nutritionBasis,
      servingMode,
      null,
      form.name,
      form.servingSize,
      form.servingUnit,
      form.gramsPerServing,
      null,
      null,
      null,
      form.calories,
      form.proteinG,
      form.carbsG,
      form.fatG,
      form.fiberG ?? null,
      form.sugarG ?? null,
      form.saturatedFatG ?? null,
      form.sodiumMg ?? null,
      form.caffeineMgPer100Ml ?? null,
      null,
      derived.kjPer100,
      derived.caloriesPer100,
      derived.proteinPer100,
      derived.carbsPer100,
      derived.sugarPer100,
      derived.fatPer100,
      derived.saturatedFatPer100,
      derived.fiberPer100,
      derived.saltPer100,
      form.barcode ?? null,
      'custom',
      1,
      1,
      now,
      now,
      null,
      'pending',
      1,
    ],
  );
  await db.runAsync(
    `INSERT INTO custom_foods
    (id, user_id, food_item_id, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [customId, userId, id, now, now, null, 'pending', 1],
  );
  await enqueueSync('food_item', id, 'insert', {
    ...form,
    itemType,
    productType: itemType,
    baseUnit,
    nutritionBasis,
    servingMode,
    servingLabel: null,
    packageSize: null,
    packageUnit: null,
    ...derived,
  });
  return id;
}

export async function getSavedMeals(userId = DEMO_USER_ID): Promise<SavedMeal[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    user_id: string;
    name: string;
    notes: string | null;
    is_favorite: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    sync_status: SavedMeal['syncStatus'];
    version: number;
  }>('SELECT * FROM saved_meals WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_favorite DESC, name ASC', [userId]);

  const meals: SavedMeal[] = [];
  for (const row of rows) {
    const itemRows = await db.getAllAsync<{
      id: string;
      saved_meal_id: string;
      food_item_id: string;
      servings: number;
      meal_slot: MealSlot | null;
      quantity_type: 'portion' | 'gram' | null;
      total_grams: number | null;
      total_calories: number | null;
      total_protein_g: number | null;
      total_carbs_g: number | null;
      total_fat_g: number | null;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
      sync_status: SavedMealItem['syncStatus'];
      version: number;
    }>('SELECT * FROM saved_meal_items WHERE saved_meal_id = ? AND deleted_at IS NULL', [row.id]);
    meals.push({
      id: row.id,
      userId: row.user_id,
      name: row.name,
      notes: row.notes,
      isFavorite: Boolean(row.is_favorite),
      items: itemRows.map((item) => ({
        id: item.id,
        savedMealId: item.saved_meal_id,
        foodItemId: item.food_item_id,
        servings: item.servings,
        mealSlot: item.meal_slot,
        quantityType: item.quantity_type ?? undefined,
        totalGrams: item.total_grams ?? undefined,
        totalCalories: item.total_calories ?? undefined,
        totalProteinG: item.total_protein_g ?? undefined,
        totalCarbsG: item.total_carbs_g ?? undefined,
        totalFatG: item.total_fat_g ?? undefined,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        deletedAt: item.deleted_at,
        syncStatus: item.sync_status,
        version: item.version,
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      deletedAt: row.deleted_at,
      syncStatus: row.sync_status,
      version: row.version,
    });
  }
  return meals;
}

export async function createSavedMeal(input: {
  name: string;
  items: SavedMealItemInput[];
  notes?: string | null;
  isFavorite?: boolean;
  userId?: string;
}): Promise<string> {
  const name = input.name.trim();
  if (!name.length) {
    throw new Error('Meal name cannot be empty.');
  }
  if (!input.items.length) {
    throw new Error('Add at least one food item.');
  }

  const db = await getDatabase();
  const userId = input.userId ?? DEMO_USER_ID;
  const foodsToCache = input.items.map((item) => item.food).filter((food): food is FoodItem => Boolean(food));
  await cacheFoodItemsInLocalDb(foodsToCache);
  const foodRowsById = new Map<string, FoodRow>();

  for (const item of input.items) {
    if (!Number.isFinite(item.servings) || item.servings <= 0) {
      throw new Error('Each meal item needs an amount greater than zero.');
    }

    const food = await db.getFirstAsync<FoodRow>('SELECT * FROM food_items WHERE id = ?', [item.foodItemId]);
    if (!food) {
      throw new Error('Food not found');
    }
    foodRowsById.set(item.foodItemId, food);
  }

  const savedMealId = createId('savedmeal');
  const now = new Date().toISOString();

  await db.runAsync(
    `INSERT INTO saved_meals
    (id, user_id, name, notes, is_favorite, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [savedMealId, userId, name, input.notes ?? null, input.isFavorite ? 1 : 0, now, now, null, 'pending', 1],
  );
  await enqueueSync('saved_meal', savedMealId, 'insert', {
    userId,
    name,
    notes: input.notes ?? null,
    isFavorite: Boolean(input.isFavorite),
  });

  for (const item of input.items) {
    const food = foodRowsById.get(item.foodItemId) as FoodRow;

    const gramsPerServing = Number.isFinite(food.grams_per_serving) && food.grams_per_serving > 0 ? food.grams_per_serving : 100;
    const servings = item.servings;
    const totalGrams = Number.isFinite(item.totalGrams) && (item.totalGrams as number) > 0 ? (item.totalGrams as number) : servings * gramsPerServing;
    const totalCalories =
      Number.isFinite(item.totalCalories) && (item.totalCalories as number) >= 0 ? (item.totalCalories as number) : food.calories * servings;
    const totalProteinG =
      Number.isFinite(item.totalProteinG) && (item.totalProteinG as number) >= 0
        ? (item.totalProteinG as number)
        : food.protein_g * servings;
    const totalCarbsG =
      Number.isFinite(item.totalCarbsG) && (item.totalCarbsG as number) >= 0 ? (item.totalCarbsG as number) : food.carbs_g * servings;
    const totalFatG = Number.isFinite(item.totalFatG) && (item.totalFatG as number) >= 0 ? (item.totalFatG as number) : food.fat_g * servings;
    const savedMealItemId = createId('savedmealitem');

    await db.runAsync(
      `INSERT INTO saved_meal_items
      (id, saved_meal_id, food_item_id, servings, meal_slot, quantity_type, total_grams, total_calories, total_protein_g, total_carbs_g, total_fat_g, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        savedMealItemId,
        savedMealId,
        item.foodItemId,
        servings,
        item.mealSlot ?? null,
        item.quantityType ?? 'portion',
        totalGrams,
        totalCalories,
        totalProteinG,
        totalCarbsG,
        totalFatG,
        now,
        now,
        null,
        'pending',
        1,
      ],
    );
    await enqueueSync('saved_meal_item', savedMealItemId, 'insert', {
      savedMealId,
      foodItemId: item.foodItemId,
      servings,
      mealSlot: item.mealSlot ?? null,
      quantityType: item.quantityType ?? 'portion',
      totalGrams,
      totalCalories,
      totalProteinG,
      totalCarbsG,
      totalFatG,
    });
  }

  return savedMealId;
}

export async function updateSavedMeal(input: {
  savedMealId: string;
  name: string;
  items: SavedMealItemInput[];
  notes?: string | null;
  isFavorite?: boolean;
  userId?: string;
}): Promise<void> {
  const name = input.name.trim();
  if (!name.length) {
    throw new Error('Meal name cannot be empty.');
  }
  if (!input.items.length) {
    throw new Error('Add at least one food item.');
  }

  const db = await getDatabase();
  const userId = input.userId ?? DEMO_USER_ID;
  const foodsToCache = input.items.map((item) => item.food).filter((food): food is FoodItem => Boolean(food));
  await cacheFoodItemsInLocalDb(foodsToCache);
  const foodRowsById = new Map<string, FoodRow>();

  const existingMeal = await db.getFirstAsync<{ id: string; notes: string | null; is_favorite: number }>(
    'SELECT id, notes, is_favorite FROM saved_meals WHERE id = ? AND user_id = ? AND deleted_at IS NULL',
    [input.savedMealId, userId],
  );
  if (!existingMeal) {
    throw new Error('Saved meal not found.');
  }

  for (const item of input.items) {
    if (!Number.isFinite(item.servings) || item.servings <= 0) {
      throw new Error('Each meal item needs an amount greater than zero.');
    }

    const food = await db.getFirstAsync<FoodRow>('SELECT * FROM food_items WHERE id = ?', [item.foodItemId]);
    if (!food) {
      throw new Error('Food not found');
    }
    foodRowsById.set(item.foodItemId, food);
  }

  const now = new Date().toISOString();
  const resolvedNotes = input.notes ?? existingMeal.notes;
  const resolvedFavorite = input.isFavorite ?? Boolean(existingMeal.is_favorite);

  await db.runAsync(
    `UPDATE saved_meals
     SET name = ?, notes = ?, is_favorite = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [name, resolvedNotes ?? null, resolvedFavorite ? 1 : 0, now, input.savedMealId, userId],
  );
  await enqueueSync('saved_meal', input.savedMealId, 'update', {
    name,
    notes: resolvedNotes ?? null,
    isFavorite: resolvedFavorite,
  });

  const existingItems = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM saved_meal_items WHERE saved_meal_id = ? AND deleted_at IS NULL',
    [input.savedMealId],
  );
  for (const existingItem of existingItems) {
    await db.runAsync(
      `UPDATE saved_meal_items
       SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
       WHERE id = ?`,
      [now, now, existingItem.id],
    );
    await enqueueSync('saved_meal_item', existingItem.id, 'delete', { id: existingItem.id });
  }

  for (const item of input.items) {
    const food = foodRowsById.get(item.foodItemId) as FoodRow;
    const gramsPerServing = Number.isFinite(food.grams_per_serving) && food.grams_per_serving > 0 ? food.grams_per_serving : 100;
    const servings = item.servings;
    const totalGrams = Number.isFinite(item.totalGrams) && (item.totalGrams as number) > 0 ? (item.totalGrams as number) : servings * gramsPerServing;
    const totalCalories =
      Number.isFinite(item.totalCalories) && (item.totalCalories as number) >= 0 ? (item.totalCalories as number) : food.calories * servings;
    const totalProteinG =
      Number.isFinite(item.totalProteinG) && (item.totalProteinG as number) >= 0
        ? (item.totalProteinG as number)
        : food.protein_g * servings;
    const totalCarbsG =
      Number.isFinite(item.totalCarbsG) && (item.totalCarbsG as number) >= 0 ? (item.totalCarbsG as number) : food.carbs_g * servings;
    const totalFatG = Number.isFinite(item.totalFatG) && (item.totalFatG as number) >= 0 ? (item.totalFatG as number) : food.fat_g * servings;
    const savedMealItemId = createId('savedmealitem');

    await db.runAsync(
      `INSERT INTO saved_meal_items
      (id, saved_meal_id, food_item_id, servings, meal_slot, quantity_type, total_grams, total_calories, total_protein_g, total_carbs_g, total_fat_g, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        savedMealItemId,
        input.savedMealId,
        item.foodItemId,
        servings,
        item.mealSlot ?? null,
        item.quantityType ?? 'portion',
        totalGrams,
        totalCalories,
        totalProteinG,
        totalCarbsG,
        totalFatG,
        now,
        now,
        null,
        'pending',
        1,
      ],
    );
    await enqueueSync('saved_meal_item', savedMealItemId, 'insert', {
      savedMealId: input.savedMealId,
      foodItemId: item.foodItemId,
      servings,
      mealSlot: item.mealSlot ?? null,
      quantityType: item.quantityType ?? 'portion',
      totalGrams,
      totalCalories,
      totalProteinG,
      totalCarbsG,
      totalFatG,
    });
  }
}

export async function createSavedMealFromDiaryEntries(input: {
  name: string;
  entries: DiaryEntry[];
  userId?: string;
}): Promise<string> {
  return createSavedMeal({
    name: input.name,
    userId: input.userId,
    items: input.entries.map((entry) => ({
      foodItemId: entry.foodItemId,
      servings: entry.servings,
      mealSlot: entry.mealSlot,
      quantityType: entry.quantityType ?? 'portion',
      totalGrams: entry.totalGrams,
      totalCalories: entry.totalCalories ?? entry.caloriesSnapshot * entry.servings,
      totalProteinG: entry.totalProteinG ?? entry.proteinGSnapshot * entry.servings,
      totalCarbsG: entry.totalCarbsG ?? entry.carbsGSnapshot * entry.servings,
      totalFatG: entry.totalFatG ?? entry.fatGSnapshot * entry.servings,
    })),
  });
}

export async function renameSavedMeal(savedMealId: string, name: string, userId = DEMO_USER_ID): Promise<void> {
  const nextName = name.trim();
  if (!nextName.length) {
    throw new Error('Meal name cannot be empty.');
  }

  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE saved_meals
     SET name = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [nextName, now, savedMealId, userId],
  );
  await enqueueSync('saved_meal', savedMealId, 'update', { name: nextName });
}

export async function duplicateSavedMeal(savedMealId: string, userId = DEMO_USER_ID): Promise<string> {
  const db = await getDatabase();
  const sourceMeal = await db.getFirstAsync<{
    name: string;
    notes: string | null;
    is_favorite: number;
  }>('SELECT name, notes, is_favorite FROM saved_meals WHERE id = ? AND user_id = ? AND deleted_at IS NULL', [savedMealId, userId]);

  if (!sourceMeal) {
    throw new Error('Saved meal not found.');
  }

  const [sourceItems, nameRows] = await Promise.all([
    db.getAllAsync<{
      food_item_id: string;
      servings: number;
      meal_slot: MealSlot | null;
      quantity_type: 'portion' | 'gram' | null;
      total_grams: number | null;
      total_calories: number | null;
      total_protein_g: number | null;
      total_carbs_g: number | null;
      total_fat_g: number | null;
    }>(
      `SELECT food_item_id, servings, meal_slot, quantity_type, total_grams, total_calories, total_protein_g, total_carbs_g, total_fat_g
       FROM saved_meal_items
       WHERE saved_meal_id = ? AND deleted_at IS NULL`,
      [savedMealId],
    ),
    db.getAllAsync<{ name: string }>('SELECT name FROM saved_meals WHERE user_id = ? AND deleted_at IS NULL', [userId]),
  ]);

  const duplicateName = buildDuplicateSavedMealName(
    sourceMeal.name,
    new Set(nameRows.map((row) => row.name.trim().toLowerCase())),
  );

  const now = new Date().toISOString();
  const duplicatedMealId = createId('savedmeal');
  await db.runAsync(
    `INSERT INTO saved_meals
    (id, user_id, name, notes, is_favorite, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [duplicatedMealId, userId, duplicateName, sourceMeal.notes, sourceMeal.is_favorite, now, now, null, 'pending', 1],
  );
  await enqueueSync('saved_meal', duplicatedMealId, 'insert', {
    userId,
    sourceSavedMealId: savedMealId,
    name: duplicateName,
    notes: sourceMeal.notes,
    isFavorite: Boolean(sourceMeal.is_favorite),
  });

  for (const sourceItem of sourceItems) {
    const duplicatedItemId = createId('savedmealitem');
    await db.runAsync(
      `INSERT INTO saved_meal_items
      (id, saved_meal_id, food_item_id, servings, meal_slot, quantity_type, total_grams, total_calories, total_protein_g, total_carbs_g, total_fat_g, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        duplicatedItemId,
        duplicatedMealId,
        sourceItem.food_item_id,
        sourceItem.servings,
        sourceItem.meal_slot,
        sourceItem.quantity_type,
        sourceItem.total_grams,
        sourceItem.total_calories,
        sourceItem.total_protein_g,
        sourceItem.total_carbs_g,
        sourceItem.total_fat_g,
        now,
        now,
        null,
        'pending',
        1,
      ],
    );
    await enqueueSync('saved_meal_item', duplicatedItemId, 'insert', {
      savedMealId: duplicatedMealId,
      foodItemId: sourceItem.food_item_id,
      servings: sourceItem.servings,
      mealSlot: sourceItem.meal_slot,
      quantityType: sourceItem.quantity_type,
      totalGrams: sourceItem.total_grams,
      totalCalories: sourceItem.total_calories,
      totalProteinG: sourceItem.total_protein_g,
      totalCarbsG: sourceItem.total_carbs_g,
      totalFatG: sourceItem.total_fat_g,
    });
  }

  return duplicatedMealId;
}

export async function deleteSavedMeal(savedMealId: string, userId = DEMO_USER_ID): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE saved_meals
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    [now, now, savedMealId, userId],
  );
  await db.runAsync(
    `UPDATE saved_meal_items
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending', version = version + 1
     WHERE saved_meal_id = ? AND deleted_at IS NULL`,
    [now, now, savedMealId],
  );
  await enqueueSync('saved_meal', savedMealId, 'delete', { id: savedMealId });
}

export async function getRecipes(userId = DEMO_USER_ID): Promise<Recipe[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{
    id: string;
    user_id: string;
    name: string;
    serving_count: number;
    instructions: string | null;
    is_favorite: number;
    created_at: string;
    updated_at: string;
    deleted_at: string | null;
    sync_status: Recipe['syncStatus'];
    version: number;
  }>('SELECT * FROM recipes WHERE user_id = ? AND deleted_at IS NULL ORDER BY is_favorite DESC, name ASC', [userId]);
  return rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    servingCount: row.serving_count,
    instructions: row.instructions,
    isFavorite: Boolean(row.is_favorite),
    ingredients: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  }));
}

function buildDuplicateSavedMealName(sourceName: string, existingNames: Set<string>): string {
  const normalizedSourceName = sourceName.trim() || 'Meal';
  const baseName = `${normalizedSourceName} Copy`;
  let candidate = baseName;
  let suffix = 2;

  while (existingNames.has(candidate.toLowerCase())) {
    candidate = `${baseName} ${suffix}`;
    suffix += 1;
  }

  return candidate;
}

export async function logSavedMeal(savedMealId: string, mealSlot: MealSlot, localDate: string, userId = DEMO_USER_ID): Promise<void> {
  const db = await getDatabase();
  const items = await db.getAllAsync<{
    food_item_id: string;
    servings: number;
    quantity_type: 'portion' | 'gram' | null;
    total_grams: number | null;
    total_calories: number | null;
    total_protein_g: number | null;
    total_carbs_g: number | null;
    total_fat_g: number | null;
  }>(
    `SELECT food_item_id, servings, quantity_type, total_grams, total_calories, total_protein_g, total_carbs_g, total_fat_g
     FROM saved_meal_items
     WHERE saved_meal_id = ? AND deleted_at IS NULL`,
    [savedMealId],
  );
  for (const item of items) {
    await addDiaryEntry({
      localDate,
      mealSlot,
      foodItemId: item.food_item_id,
      servings: item.servings,
      quantityType: item.quantity_type ?? undefined,
      totalGrams: item.total_grams ?? undefined,
      totalCalories: item.total_calories ?? undefined,
      totalProteinG: item.total_protein_g ?? undefined,
      totalCarbsG: item.total_carbs_g ?? undefined,
      totalFatG: item.total_fat_g ?? undefined,
      sourceSavedMealId: savedMealId,
      userId,
    });
  }
}

export async function logRecipeServing(recipeId: string, mealSlot: MealSlot, localDate: string, userId = DEMO_USER_ID): Promise<void> {
  const db = await getDatabase();
  const recipe = await db.getFirstAsync<{ serving_count: number }>('SELECT serving_count FROM recipes WHERE id = ?', [recipeId]);
  const ingredients = await db.getAllAsync<{ food_item_id: string; servings: number }>(
    'SELECT food_item_id, servings FROM recipe_ingredients WHERE recipe_id = ? AND deleted_at IS NULL',
    [recipeId],
  );
  const divisor = recipe?.serving_count && recipe.serving_count > 0 ? recipe.serving_count : 1;
  for (const ingredient of ingredients) {
    await addDiaryEntry({
      localDate,
      mealSlot,
      foodItemId: ingredient.food_item_id,
      servings: ingredient.servings / divisor,
      userId,
    });
  }
}

async function getOrCreateDiaryDay(localDate: string, userId: string): Promise<string> {
  const db = await getDatabase();
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM diary_days WHERE user_id = ? AND local_date = ?',
    [userId, localDate],
  );
  if (existing) {
    return existing.id;
  }
  const id = createId('diary');
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO diary_days
    (id, user_id, local_date, notes, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, userId, localDate, null, now, now, null, 'pending', 1],
  );
  await enqueueSync('diary_day', id, 'insert', { localDate });
  return id;
}

async function searchSupabaseFoodItems(query: string, itemType: FoodSearchItemType): Promise<FoodItem[]> {
  const supabaseClient = supabase;
  if (!isSupabaseConfigured || !supabaseClient) {
    return [];
  }

  const trimmed = query.trim();
  if (!trimmed.length) {
    return [];
  }

  try {
    const likeSearch = `%${trimmed}%`;
    const fetchFallback = async (): Promise<{ foods: FoodItem[]; usedLegacyFallback: boolean; failed: boolean }> => {
      let fallbackQuery = supabaseClient
        .from('food_items')
        .select(SUPABASE_SEARCH_SELECT_EXTENDED)
        .is('deleted_at', null)
        .or(`name.ilike.${likeSearch},brand_name.ilike.${likeSearch},barcode.ilike.${likeSearch}`)
        .order('is_custom', { ascending: false })
        .order('is_verified', { ascending: false })
        .order('name', { ascending: true })
        .limit(50);
      if (itemType !== 'all') {
        fallbackQuery = fallbackQuery.eq('item_type', itemType);
      }
      let fallback: {
        data: SupabaseFoodSearchRow[] | null;
        error: { code?: string; message?: string } | null;
      } = await fallbackQuery;
      let usedLegacyFallback = false;

      if (isSupabaseMissingColumnError(fallback.error)) {
        usedLegacyFallback = true;
        fallback = await supabaseClient
          .from('food_items')
          .select(SUPABASE_SEARCH_SELECT_LEGACY)
          .is('deleted_at', null)
          .or(`name.ilike.${likeSearch},brand_name.ilike.${likeSearch}`)
          .order('is_custom', { ascending: false })
          .order('is_verified', { ascending: false })
          .order('name', { ascending: true })
          .limit(50);
      }

      if (fallback.error || !Array.isArray(fallback.data)) {
        return { foods: [], usedLegacyFallback, failed: true };
      }

      const foods = fallback.data.map(mapSupabaseSearchFood).filter((food) => matchesFoodItemType(food.itemType, itemType));
      return { foods, usedLegacyFallback, failed: false };
    };

    const rpcResponse = await supabaseClient.rpc('search_food_items_snapshot', {
      search_query: trimmed,
      max_results: 50,
      search_item_type: itemType === 'all' ? null : itemType,
    });

    if (!rpcResponse.error && Array.isArray(rpcResponse.data)) {
      const rpcRows = rpcResponse.data as Array<Record<string, unknown>>;
      const rpcMissingCaffeineField =
        (itemType === 'drink' || itemType === 'all')
        && rpcRows.length > 0
        && !Object.prototype.hasOwnProperty.call(rpcRows[0], 'caffeine_mg_per_100ml');

      if (!rpcMissingCaffeineField) {
        return rpcRows
          .map((row) => mapSupabaseSearchFood(row as SupabaseFoodSearchRow))
          .filter((food) => matchesFoodItemType(food.itemType, itemType));
      }

      const fallback = await fetchFallback();
      if (!fallback.failed) {
        if (fallback.usedLegacyFallback && itemType === 'drink') {
          return [];
        }
        return fallback.foods;
      }
      return rpcRows
        .map((row) => mapSupabaseSearchFood(row as SupabaseFoodSearchRow))
        .filter((food) => matchesFoodItemType(food.itemType, itemType));
    }

    const fallback = await fetchFallback();
    if (fallback.failed) {
      return [];
    }
    if (fallback.usedLegacyFallback && itemType === 'drink') {
      return [];
    }
    return fallback.foods;
  } catch {
    return [];
  }
}

async function cacheFoodItemsInLocalDb(foods: FoodItem[]): Promise<void> {
  if (!foods.length) {
    return;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();

  for (const food of foods) {
    const itemType = normalizeFoodItemType(food.productType ?? food.itemType);
    const baseUnit = food.baseUnit ?? (itemType === 'drink' ? 'ml' : 'g');
    const nutritionBasis = food.nutritionBasis ?? (baseUnit === 'ml' ? 'per_100ml' : 'per_100g');
    const servingMode = food.servingMode ?? (food.packageSize ? 'fixed_package' : food.servingLabel ? 'suggested_amount' : 'custom_amount');
    const servingSize = Number.isFinite(food.servingSize) && food.servingSize > 0 ? food.servingSize : 100;
    const servingUnit = food.servingUnit?.trim() ? food.servingUnit : baseUnit;
    const gramsPerServing = Number.isFinite(food.gramsPerServing) && food.gramsPerServing > 0 ? food.gramsPerServing : 100;
    const calories = Number.isFinite(food.calories) ? food.calories : 0;
    const proteinG = Number.isFinite(food.proteinG) ? food.proteinG : 0;
    const carbsG = Number.isFinite(food.carbsG) ? food.carbsG : 0;
    const fatG = Number.isFinite(food.fatG) ? food.fatG : 0;

    await db.runAsync(
      `INSERT INTO food_items
      (id, user_id, brand_id, brand_name, item_type, product_type, base_unit, nutrition_basis, serving_mode, serving_label, name, serving_size, serving_unit, grams_per_serving, package_size, package_size_value, package_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g, sodium_mg, caffeine_mg_per_100ml, caffeine_mg_per_can, kj_per_100, calories_per_100, protein_per_100, carbs_per_100, sugar_per_100, fat_per_100, saturated_fat_per_100, fiber_per_100, salt_per_100, barcode, source_provider, is_verified, is_custom, created_at, updated_at, deleted_at, sync_status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        user_id = excluded.user_id,
        brand_id = excluded.brand_id,
        brand_name = excluded.brand_name,
        item_type = excluded.item_type,
        product_type = excluded.product_type,
        base_unit = excluded.base_unit,
        nutrition_basis = excluded.nutrition_basis,
        serving_mode = excluded.serving_mode,
        serving_label = excluded.serving_label,
        name = excluded.name,
        serving_size = excluded.serving_size,
        serving_unit = excluded.serving_unit,
        grams_per_serving = excluded.grams_per_serving,
        package_size = excluded.package_size,
        package_size_value = excluded.package_size_value,
        package_unit = excluded.package_unit,
        calories = excluded.calories,
        protein_g = excluded.protein_g,
        carbs_g = excluded.carbs_g,
        fat_g = excluded.fat_g,
        fiber_g = excluded.fiber_g,
        sugar_g = excluded.sugar_g,
        saturated_fat_g = excluded.saturated_fat_g,
        sodium_mg = excluded.sodium_mg,
        caffeine_mg_per_100ml = excluded.caffeine_mg_per_100ml,
        caffeine_mg_per_can = excluded.caffeine_mg_per_can,
        kj_per_100 = excluded.kj_per_100,
        calories_per_100 = excluded.calories_per_100,
        protein_per_100 = excluded.protein_per_100,
        carbs_per_100 = excluded.carbs_per_100,
        sugar_per_100 = excluded.sugar_per_100,
        fat_per_100 = excluded.fat_per_100,
        saturated_fat_per_100 = excluded.saturated_fat_per_100,
        fiber_per_100 = excluded.fiber_per_100,
        salt_per_100 = excluded.salt_per_100,
        barcode = excluded.barcode,
        source_provider = excluded.source_provider,
        is_verified = excluded.is_verified,
        is_custom = excluded.is_custom,
        updated_at = excluded.updated_at,
        deleted_at = null,
        sync_status = 'synced'`,
      [
        food.id,
        food.userId ?? null,
        food.brandId ?? null,
        food.brandName ?? null,
        itemType,
        itemType,
        baseUnit,
        nutritionBasis,
        servingMode,
        food.servingLabel ?? null,
        food.name,
        servingSize,
        servingUnit,
        gramsPerServing,
        food.packageSizeLabel ?? null,
        food.packageSize ?? null,
        food.packageUnit ?? null,
        calories,
        proteinG,
        carbsG,
        fatG,
        food.fiberG ?? null,
        food.sugarG ?? null,
        food.saturatedFatG ?? null,
        food.sodiumMg ?? null,
        food.caffeineMgPer100Ml ?? null,
        food.caffeineMgPerCan ?? null,
        food.kjPer100 ?? null,
        food.caloriesPer100 ?? null,
        food.proteinPer100 ?? null,
        food.carbsPer100 ?? null,
        food.sugarPer100 ?? null,
        food.fatPer100 ?? null,
        food.saturatedFatPer100 ?? null,
        food.fiberPer100 ?? null,
        food.saltPer100 ?? null,
        food.barcode ?? null,
        food.sourceProvider,
        food.isVerified ? 1 : 0,
        food.isCustom ? 1 : 0,
        now,
        now,
        null,
        'synced',
        1,
      ],
    );
  }
}

function mergeFoodSearchResults(localFoods: FoodItem[], remoteFoods: FoodItem[]): FoodItem[] {
  const byKey = new Map<string, FoodItem>();

  for (const food of localFoods) {
    const key = `${food.id}:${food.barcode ?? ''}`;
    byKey.set(key, food);
  }

  // Prefer remote rows when the same item exists locally, so newly migrated
  // nutrition fields (for example caffeine_mg_per_100ml) are used immediately.
  for (const food of remoteFoods) {
    const key = `${food.id}:${food.barcode ?? ''}`;
    byKey.set(key, food);
  }

  return Array.from(byKey.values()).slice(0, 50);
}

function mapSupabaseSearchFood(row: SupabaseFoodSearchRow): FoodItem {
  const parsedPackage = parsePackageSizeLabel(row.package_size ?? null);
  const packageSize =
    (Number.isFinite(row.package_size_value) && (row.package_size_value as number) > 0 ? (row.package_size_value as number) : null)
    ?? parsedPackage.size;
  const packageUnit = (row.package_unit === 'ml' || row.package_unit === 'g' ? row.package_unit : null) ?? parsedPackage.unit;
  const inferredItemType = normalizeFoodItemType(row.product_type ?? row.item_type ?? 'food');
  const baseUnit = normalizeFoodBaseUnit(row.base_unit, inferredItemType);
  const nutritionBasis = normalizeNutritionBasis(row.nutrition_basis, baseUnit);
  const servingMode = normalizeServingMode(row.serving_mode, packageSize, row.serving_label ?? null);
  const defaultServingSize =
    Number.isFinite(row.serving_size) && (row.serving_size ?? 0) > 0
      ? (row.serving_size as number)
      : servingMode === 'fixed_package' && Number.isFinite(packageSize) && (packageSize ?? 0) > 0
        ? packageSize!
        : 100;
  const defaultServingUnit =
    row.serving_unit?.trim()
    || (servingMode === 'fixed_package' && packageUnit ? packageUnit : null)
    || (baseUnit === 'ml' ? 'ml' : 'g');
  const gramsPerServing =
    Number.isFinite(row.grams_per_serving) && (row.grams_per_serving ?? 0) > 0
      ? (row.grams_per_serving as number)
      : defaultServingSize;

  return mapFood({
    id: row.id,
    user_id: null,
    brand_id: null,
    brand_name: row.brand_name,
    item_type: inferredItemType,
    product_type: row.product_type ?? inferredItemType,
    base_unit: baseUnit,
    nutrition_basis: nutritionBasis,
    serving_mode: servingMode,
    serving_label: row.serving_label ?? null,
    name: row.name,
    serving_size: defaultServingSize,
    serving_unit: defaultServingUnit,
    grams_per_serving: gramsPerServing,
    package_size: row.package_size ?? null,
    package_size_value: packageSize,
    package_unit: packageUnit,
    calories: row.calories ?? 0,
    protein_g: row.protein_g ?? 0,
    carbs_g: row.carbs_g ?? 0,
    fat_g: row.fat_g ?? 0,
    fiber_g: row.fiber_g,
    sugar_g: row.sugar_g ?? null,
    saturated_fat_g: row.saturated_fat_g ?? null,
    sodium_mg: row.sodium_mg,
    caffeine_mg_per_100ml: row.caffeine_mg_per_100ml ?? null,
    caffeine_mg_per_can: row.caffeine_mg_per_can ?? null,
    kj_per_100: row.kj_per_100 ?? null,
    calories_per_100: row.calories_per_100 ?? null,
    protein_per_100: row.protein_per_100 ?? null,
    carbs_per_100: row.carbs_per_100 ?? null,
    sugar_per_100: row.sugar_per_100 ?? null,
    fat_per_100: row.fat_per_100 ?? null,
    saturated_fat_per_100: row.saturated_fat_per_100 ?? null,
    fiber_per_100: row.fiber_per_100 ?? null,
    salt_per_100: row.salt_per_100 ?? null,
    barcode: row.barcode ?? null,
    source_provider: row.source_provider ?? 'search',
    is_verified: row.is_verified,
    is_custom: row.is_custom,
  });
}

function normalizeFoodSourceProvider(value: string): FoodItem['sourceProvider'] {
  if (
    value === 'seed' ||
    value === 'custom' ||
    value === 'barcode' ||
    value === 'search' ||
    value === 'oda_private_snapshot'
  ) {
    return value;
  }
  return 'search';
}

function mapFood(row: FoodRow): FoodItem {
  const itemType = normalizeFoodItemType(row.product_type ?? row.item_type);
  const parsedPackage = parsePackageSizeLabel(row.package_size ?? null);
  const packageSize =
    (Number.isFinite(row.package_size_value) && (row.package_size_value as number) > 0 ? (row.package_size_value as number) : null)
    ?? parsedPackage.size;
  const packageUnit = (row.package_unit === 'ml' || row.package_unit === 'g' ? row.package_unit : null) ?? parsedPackage.unit;
  const baseUnit = normalizeFoodBaseUnit(row.base_unit, itemType);
  const nutritionBasis = normalizeNutritionBasis(row.nutrition_basis, baseUnit);
  const servingMode = normalizeServingMode(row.serving_mode, packageSize, row.serving_label);
  const servingSize =
    Number.isFinite(row.serving_size) && row.serving_size > 0
      ? row.serving_size
      : servingMode === 'fixed_package' && Number.isFinite(packageSize) && (packageSize ?? 0) > 0
        ? packageSize!
        : 100;
  const servingUnit = row.serving_unit?.trim() || (servingMode === 'fixed_package' && packageUnit ? packageUnit : baseUnit);
  const gramsPerServing =
    Number.isFinite(row.grams_per_serving) && row.grams_per_serving > 0 ? row.grams_per_serving : servingSize;

  return {
    id: row.id,
    userId: row.user_id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    itemType,
    productType: itemType,
    baseUnit,
    nutritionBasis,
    servingMode,
    servingLabel: row.serving_label,
    name: row.name,
    servingSize,
    servingUnit,
    gramsPerServing,
    packageSize: packageSize,
    packageUnit: packageUnit,
    packageSizeLabel: row.package_size,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g,
    sugarG: row.sugar_g,
    saturatedFatG: row.saturated_fat_g,
    sodiumMg: row.sodium_mg,
    caffeineMgPer100Ml: row.caffeine_mg_per_100ml,
    caffeineMgPerCan: row.caffeine_mg_per_can,
    kjPer100: row.kj_per_100,
    caloriesPer100: row.calories_per_100,
    proteinPer100: row.protein_per_100,
    carbsPer100: row.carbs_per_100,
    sugarPer100: row.sugar_per_100,
    fatPer100: row.fat_per_100,
    saturatedFatPer100: row.saturated_fat_per_100,
    fiberPer100: row.fiber_per_100,
    saltPer100: row.salt_per_100,
    barcode: row.barcode,
    sourceProvider: normalizeFoodSourceProvider(String(row.source_provider ?? 'search')),
    isVerified: Boolean(row.is_verified),
    isCustom: Boolean(row.is_custom),
  };
}

function mapDiaryEntry(row: DiaryEntryRow): DiaryEntry {
  return {
    id: row.id,
    userId: row.user_id,
    diaryDayId: row.diary_day_id,
    mealSlot: row.meal_slot,
    foodItemId: row.food_item_id,
    servings: row.servings,
    quantityType: row.quantity_type ?? undefined,
    totalGrams: row.total_grams ?? undefined,
    totalCalories: row.total_calories ?? undefined,
    totalProteinG: row.total_protein_g ?? undefined,
    totalCarbsG: row.total_carbs_g ?? undefined,
    totalFatG: row.total_fat_g ?? undefined,
    sourceSavedMealId: row.source_saved_meal_id,
    loggedAt: row.logged_at,
    foodNameSnapshot: row.food_name_snapshot,
    caloriesSnapshot: row.calories_snapshot,
    proteinGSnapshot: row.protein_g_snapshot,
    carbsGSnapshot: row.carbs_g_snapshot,
    fatGSnapshot: row.fat_g_snapshot,
    fiberGSnapshot: row.fiber_g_snapshot,
    sodiumMgSnapshot: row.sodium_mg_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}

function mapDiaryDay(row: DiaryDayRow, entries: DiaryEntry[], waterMl: number): DiaryDay {
  return {
    id: row.id,
    userId: row.user_id,
    localDate: row.local_date,
    notes: row.notes,
    entries,
    waterMl,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    syncStatus: row.sync_status,
    version: row.version,
  };
}
