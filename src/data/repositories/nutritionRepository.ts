import { getDatabase } from '@/data/db/database';
import { createId, DEMO_USER_ID } from '@/data/db/ids';
import { enqueueSync } from '@/data/sync/syncQueue';
import { toLocalDateKey } from '@/domain/calculations/dates';
import { sumDiaryEntries } from '@/domain/calculations/nutrition';
import {
  DiaryDay,
  DiaryEntry,
  FoodItem,
  MealSlot,
  NutritionTotals,
  Recipe,
  SavedMeal,
  SavedMealItem,
} from '@/domain/models';
import { CustomFoodForm } from '@/domain/validation/forms';

type FoodRow = {
  id: string;
  user_id: string | null;
  brand_id: string | null;
  brand_name: string | null;
  name: string;
  serving_size: number;
  serving_unit: string;
  grams_per_serving: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  sugar_g: number | null;
  saturated_fat_g: number | null;
  sodium_mg: number | null;
  barcode: string | null;
  source_provider: FoodItem['sourceProvider'];
  is_verified: number;
  is_custom: number;
};

type DiaryEntryRow = {
  id: string;
  user_id: string;
  diary_day_id: string;
  meal_slot: MealSlot;
  food_item_id: string;
  servings: number;
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

export interface DiarySummary {
  day: DiaryDay;
  totals: NutritionTotals;
  byMeal: Record<MealSlot, DiaryEntry[]>;
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
  const rows: Array<{ localDate: string; totals: NutritionTotals }> = [];
  for (const localDate of localDates) {
    const diary = await getDiary(localDate, userId);
    rows.push({ localDate, totals: diary.totals });
  }
  return rows;
}

export async function searchFoodItems(query: string, userId = DEMO_USER_ID): Promise<FoodItem[]> {
  const db = await getDatabase();
  const search = `%${query.trim()}%`;
  const rows = await db.getAllAsync<FoodRow>(
    `SELECT * FROM food_items
     WHERE deleted_at IS NULL
       AND (user_id IS NULL OR user_id = ?)
       AND (? = '%%' OR name LIKE ? OR brand_name LIKE ? OR barcode LIKE ?)
     ORDER BY is_custom DESC, is_verified DESC, name ASC
     LIMIT 50`,
    [userId, search, search, search, search],
  );
  return rows.map(mapFood);
}

export async function getRecentFoods(userId = DEMO_USER_ID): Promise<FoodItem[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<FoodRow>(
    `SELECT DISTINCT f.*
     FROM diary_entries e
     JOIN food_items f ON f.id = e.food_item_id
     WHERE e.user_id = ? AND e.deleted_at IS NULL
     ORDER BY e.logged_at DESC
     LIMIT 10`,
    [userId],
  );
  return rows.map(mapFood);
}

export async function addDiaryEntry(input: {
  localDate: string;
  mealSlot: MealSlot;
  foodItemId: string;
  servings: number;
  userId?: string;
}): Promise<string> {
  const db = await getDatabase();
  const userId = input.userId ?? DEMO_USER_ID;
  const dayId = await getOrCreateDiaryDay(input.localDate, userId);
  const food = await db.getFirstAsync<FoodRow>('SELECT * FROM food_items WHERE id = ?', [input.foodItemId]);
  if (!food) {
    throw new Error('Food not found');
  }
  const id = createId('entry');
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO diary_entries
    (id, user_id, diary_day_id, meal_slot, food_item_id, servings, logged_at, food_name_snapshot, calories_snapshot, protein_g_snapshot, carbs_g_snapshot, fat_g_snapshot, fiber_g_snapshot, sodium_mg_snapshot, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      dayId,
      input.mealSlot,
      input.foodItemId,
      input.servings,
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
  await enqueueSync('diary_entry', id, 'insert', input);
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

export async function createCustomFood(form: CustomFoodForm, userId = DEMO_USER_ID): Promise<string> {
  const db = await getDatabase();
  const id = createId('food');
  const customId = createId('custom_food');
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO food_items
    (id, user_id, brand_id, brand_name, name, serving_size, serving_unit, grams_per_serving, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g, sodium_mg, barcode, source_provider, is_verified, is_custom, created_at, updated_at, deleted_at, sync_status, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      userId,
      null,
      form.brandName ?? null,
      form.name,
      form.servingSize,
      form.servingUnit,
      form.gramsPerServing,
      form.calories,
      form.proteinG,
      form.carbsG,
      form.fatG,
      form.fiberG ?? null,
      null,
      null,
      form.sodiumMg ?? null,
      null,
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
  await enqueueSync('food_item', id, 'insert', form);
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

export async function logSavedMeal(savedMealId: string, mealSlot: MealSlot, localDate: string, userId = DEMO_USER_ID): Promise<void> {
  const db = await getDatabase();
  const items = await db.getAllAsync<{ food_item_id: string; servings: number }>(
    'SELECT food_item_id, servings FROM saved_meal_items WHERE saved_meal_id = ? AND deleted_at IS NULL',
    [savedMealId],
  );
  for (const item of items) {
    await addDiaryEntry({ localDate, mealSlot, foodItemId: item.food_item_id, servings: item.servings, userId });
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

function mapFood(row: FoodRow): FoodItem {
  return {
    id: row.id,
    userId: row.user_id,
    brandId: row.brand_id,
    brandName: row.brand_name,
    name: row.name,
    servingSize: row.serving_size,
    servingUnit: row.serving_unit,
    gramsPerServing: row.grams_per_serving,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatG: row.fat_g,
    fiberG: row.fiber_g,
    sugarG: row.sugar_g,
    saturatedFatG: row.saturated_fat_g,
    sodiumMg: row.sodium_mg,
    barcode: row.barcode,
    sourceProvider: row.source_provider,
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
