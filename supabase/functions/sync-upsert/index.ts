import { createClient } from 'npm:@supabase/supabase-js@2.104.0';

type SyncOperation = 'insert' | 'update' | 'delete' | 'upsert';

type SyncRequest = {
  entityType: string;
  entityId: string;
  operation: SyncOperation;
  payload?: Record<string, unknown>;
  idempotencyKey?: string;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY') ?? '';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function toIsoOrNull(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function hasValue<T>(value: T | null | undefined): value is T {
  return value !== undefined && value !== null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'Server env is missing SUPABASE_URL and/or SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY' }, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return json({ error: 'Unauthorized', details: userError?.message ?? 'No user' }, 401);
  }

  let body: SyncRequest;
  try {
    body = (await req.json()) as SyncRequest;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const entityType = body.entityType;
  const entityId = body.entityId;
  const operation = body.operation;
  const payload = body.payload ?? {};
  const idempotencyKey = body.idempotencyKey ?? `${entityType}:${entityId}:${operation}`;
  const userId = user.id;
  const nowIso = new Date().toISOString();

  if (!entityType || !entityId || !operation) {
    return json({ error: 'entityType, entityId and operation are required' }, 400);
  }

  const { data: existingEvent, error: existingEventError } = await supabase
    .from('sync_events')
    .select('id')
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (existingEventError) {
    return json({ error: 'Failed to check idempotency', details: existingEventError.message }, 500);
  }

  if (existingEvent) {
    return json({ ok: true, deduped: true });
  }

  async function writeSyncEvent(): Promise<{ deduped: boolean }> {
    const { error } = await supabase.from('sync_events').insert({
      idempotency_key: idempotencyKey,
      entity_type: entityType,
      entity_id: entityId,
      operation,
      user_id: userId,
    });
    if (!error) {
      return { deduped: false };
    }
    if (error.code === '23505') {
      return { deduped: true };
    }
    if (error) {
      throw new Error(error.message);
    }
    return { deduped: false };
  }

  async function upsertById(table: string, row: Record<string, unknown>) {
    const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
    if (error) throw new Error(error.message);
  }

  async function upsertByUser(table: string, row: Record<string, unknown>) {
    const { error } = await supabase.from(table).upsert(row, { onConflict: 'user_id' });
    if (error) throw new Error(error.message);
  }

  async function softDelete(table: string, id: string) {
    const { error } = await supabase.from(table).update({ deleted_at: nowIso }).eq('id', id);
    if (error) throw new Error(error.message);
  }

  async function ensureDiaryDay(localDate: string): Promise<string> {
    const { data: existing, error: findError } = await supabase
      .from('diary_days')
      .select('id')
      .eq('user_id', userId)
      .eq('local_date', localDate)
      .is('deleted_at', null)
      .maybeSingle();
    if (findError) throw new Error(findError.message);
    if (existing?.id) return existing.id;

    const dayId = `diary_${crypto.randomUUID()}`;
    const { error: insertError } = await supabase.from('diary_days').insert({
      id: dayId,
      user_id: userId,
      local_date: localDate,
      notes: null,
      created_at: nowIso,
      updated_at: nowIso,
      deleted_at: null,
    });
    if (insertError) throw new Error(insertError.message);
    return dayId;
  }

  try {
    switch (entityType) {
      case 'user_profile': {
        if (operation === 'delete') {
          const { error } = await supabase.from('user_profiles').update({ deleted_at: nowIso }).eq('user_id', userId);
          if (error) throw new Error(error.message);
          break;
        }

        const row: Record<string, unknown> = {
          user_id: userId,
          updated_at: nowIso,
        };

        if (hasValue(payload.age)) row.age = payload.age;
        if (hasValue(payload.sex)) row.sex = payload.sex;
        if (hasValue(payload.heightCm)) row.height_cm = payload.heightCm;
        if (hasValue(payload.currentWeightKg)) row.current_weight_kg = payload.currentWeightKg;
        if (hasValue(payload.dietPreferences)) row.diet_preferences = payload.dietPreferences;

        await upsertByUser('user_profiles', row);
        break;
      }

      case 'goal_settings': {
        if (operation === 'delete') {
          const { error } = await supabase.from('goal_settings').update({ deleted_at: nowIso }).eq('user_id', userId);
          if (error) throw new Error(error.message);
          break;
        }

        const row: Record<string, unknown> = {
          user_id: userId,
          updated_at: nowIso,
        };

        if (hasValue(payload.workoutsPerWeekTarget)) row.workouts_per_week_target = payload.workoutsPerWeekTarget;
        if (hasValue(payload.calorieTarget)) row.calorie_target = payload.calorieTarget;
        if (hasValue(payload.proteinTargetG)) row.protein_target_g = payload.proteinTargetG;
        if (hasValue(payload.carbTargetG)) row.carb_target_g = payload.carbTargetG;
        if (hasValue(payload.fatTargetG)) row.fat_target_g = payload.fatTargetG;
        if (hasValue(payload.waterTargetMl)) row.water_target_ml = payload.waterTargetMl;

        await upsertByUser('goal_settings', row);
        break;
      }

      case 'workout_session': {
        if (operation === 'delete') {
          await softDelete('workout_sessions', entityId);
          break;
        }

        if (operation === 'insert' || operation === 'upsert') {
          await upsertById('workout_sessions', {
            id: entityId,
            user_id: userId,
            routine_id: (payload.routineId as string | undefined) ?? null,
            title: (payload.title as string | undefined) ?? null,
            started_at: toIsoOrNull(payload.startedAt) ?? nowIso,
            ended_at: toIsoOrNull(payload.endedAt),
            status: (payload.status as string | undefined) ?? 'active',
            notes: (payload.notes as string | undefined) ?? null,
            updated_at: nowIso,
          });
          break;
        }

        const patch: Record<string, unknown> = { updated_at: nowIso };
        if (hasValue(payload.routineId)) patch.routine_id = payload.routineId;
        if (hasValue(payload.title)) patch.title = payload.title;
        if (hasValue(payload.startedAt)) patch.started_at = toIsoOrNull(payload.startedAt);
        if (hasValue(payload.endedAt)) patch.ended_at = toIsoOrNull(payload.endedAt);
        if (hasValue(payload.status)) patch.status = payload.status;
        if (hasValue(payload.notes)) patch.notes = payload.notes;
        const { error } = await supabase.from('workout_sessions').update(patch).eq('id', entityId);
        if (error) throw new Error(error.message);
        break;
      }

      case 'workout_exercise': {
        if (operation === 'delete') {
          await softDelete('workout_exercises', entityId);
          break;
        }

        const row: Record<string, unknown> = {
          id: entityId,
          workout_session_id: payload.sessionId,
          exercise_id: payload.exerciseId,
          updated_at: nowIso,
        };
        if (hasValue(payload.sortOrder)) row.sort_order = payload.sortOrder;
        if (hasValue(payload.supersetGroup)) row.superset_group = payload.supersetGroup;
        if (hasValue(payload.notes)) row.notes = payload.notes;

        await upsertById('workout_exercises', row);
        break;
      }

      case 'workout_set': {
        if (operation === 'delete') {
          await softDelete('workout_sets', entityId);
          break;
        }

        if (operation === 'insert' || operation === 'upsert') {
          await upsertById('workout_sets', {
            id: entityId,
            workout_exercise_id: payload.workoutExerciseId,
            set_type: (payload.setType as string | undefined) ?? 'normal',
            updated_at: nowIso,
          });
          break;
        }

        const patch: Record<string, unknown> = {
          updated_at: nowIso,
        };

        if (hasValue(payload.weightKg)) patch.weight_kg = payload.weightKg;
        if (hasValue(payload.reps)) patch.reps = payload.reps;
        if (hasValue(payload.setType)) patch.set_type = payload.setType;
        if (hasValue(payload.rpe)) patch.rpe = payload.rpe;
        if (hasValue(payload.rir)) patch.rir = payload.rir;
        if (hasValue(payload.durationSeconds)) patch.duration_seconds = payload.durationSeconds;
        if (hasValue(payload.distanceMeters)) patch.distance_meters = payload.distanceMeters;
        if (hasValue(payload.isCompleted)) patch.is_completed = Boolean(payload.isCompleted);
        if (hasValue(payload.completedAt)) patch.completed_at = toIsoOrNull(payload.completedAt);

        const { error } = await supabase.from('workout_sets').update(patch).eq('id', entityId);
        if (error) throw new Error(error.message);
        break;
      }

      case 'diary_day': {
        if (operation === 'delete') {
          await softDelete('diary_days', entityId);
          break;
        }

        const localDate = (payload.localDate as string | undefined) ?? null;
        await upsertById('diary_days', {
          id: entityId,
          user_id: userId,
          local_date: localDate,
          notes: (payload.notes as string | undefined) ?? null,
          updated_at: nowIso,
        });
        break;
      }

      case 'diary_entry': {
        if (operation === 'delete') {
          await softDelete('diary_entries', entityId);
          break;
        }

        if (operation === 'insert' || operation === 'upsert') {
          const localDate = payload.localDate as string | undefined;
          const diaryDayId = localDate ? await ensureDiaryDay(localDate) : null;

          await upsertById('diary_entries', {
            id: entityId,
            user_id: userId,
            diary_day_id: diaryDayId,
            local_date: localDate ?? null,
            meal_slot: (payload.mealSlot as string | undefined) ?? null,
            food_item_id: (payload.foodItemId as string | undefined) ?? null,
            servings: (payload.servings as number | undefined) ?? null,
            quantity_type: (payload.quantityType as string | undefined) ?? null,
            total_grams: (payload.totalGrams as number | undefined) ?? null,
            total_calories: (payload.totalCalories as number | undefined) ?? null,
            total_protein_g: (payload.totalProteinG as number | undefined) ?? null,
            total_carbs_g: (payload.totalCarbsG as number | undefined) ?? null,
            total_fat_g: (payload.totalFatG as number | undefined) ?? null,
            logged_at: nowIso,
            updated_at: nowIso,
          });
          break;
        }

        const patch: Record<string, unknown> = { updated_at: nowIso };
        if (hasValue(payload.servings)) patch.servings = payload.servings;
        if (hasValue(payload.mealSlot)) patch.meal_slot = payload.mealSlot;
        if (hasValue(payload.foodItemId)) patch.food_item_id = payload.foodItemId;
        if (hasValue(payload.loggedAt)) patch.logged_at = toIsoOrNull(payload.loggedAt);
        if (hasValue(payload.quantityType)) patch.quantity_type = payload.quantityType;
        if (hasValue(payload.totalGrams)) patch.total_grams = payload.totalGrams;
        if (hasValue(payload.totalCalories)) patch.total_calories = payload.totalCalories;
        if (hasValue(payload.totalProteinG)) patch.total_protein_g = payload.totalProteinG;
        if (hasValue(payload.totalCarbsG)) patch.total_carbs_g = payload.totalCarbsG;
        if (hasValue(payload.totalFatG)) patch.total_fat_g = payload.totalFatG;

        const { error } = await supabase.from('diary_entries').update(patch).eq('id', entityId);
        if (error) throw new Error(error.message);
        break;
      }

      case 'water_log': {
        if (operation === 'delete') {
          await softDelete('water_logs', entityId);
          break;
        }

        await upsertById('water_logs', {
          id: entityId,
          user_id: userId,
          local_date: payload.localDate,
          amount_ml: payload.amountMl,
          logged_at: nowIso,
          updated_at: nowIso,
        });
        break;
      }

      case 'food_item': {
        if (operation === 'delete') {
          await softDelete('food_items', entityId);
          break;
        }

        const row: Record<string, unknown> = {
          id: entityId,
          user_id: userId,
          name: payload.name,
          brand_name: (payload.brandName as string | undefined) ?? null,
          serving_size: payload.servingSize,
          serving_unit: payload.servingUnit,
          grams_per_serving: payload.gramsPerServing,
          calories: payload.calories,
          protein_g: payload.proteinG,
          carbs_g: payload.carbsG,
          fat_g: payload.fatG,
          fiber_g: (payload.fiberG as number | undefined) ?? null,
          sodium_mg: (payload.sodiumMg as number | undefined) ?? null,
          source_provider: 'custom',
          is_custom: true,
          is_verified: true,
          updated_at: nowIso,
        };

        await upsertById('food_items', row);
        break;
      }

      default:
        return json({ error: `Unsupported entityType: ${entityType}` }, 400);
    }

    const syncEventResult = await writeSyncEvent();
    return json({ ok: true, deduped: syncEventResult.deduped });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    return json({ error: message }, 500);
  }
});
