-- FormFuel sync schema for Supabase
-- Uses text IDs to match local SQLite identifiers (e.g. workout_xxx, set_xxx).

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sync_events (
  id bigserial primary key,
  idempotency_key text not null unique,
  entity_type text not null,
  entity_id text not null,
  operation text not null,
  user_id text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.user_profiles (
  user_id text primary key,
  age int,
  sex text,
  height_cm double precision,
  current_weight_kg double precision,
  diet_preferences text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.goal_settings (
  user_id text primary key,
  workouts_per_week_target int,
  calorie_target double precision,
  protein_target_g double precision,
  carb_target_g double precision,
  fat_target_g double precision,
  water_target_ml double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.workout_sessions (
  id text primary key,
  user_id text not null,
  routine_id text,
  title text,
  started_at timestamptz,
  ended_at timestamptz,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_workout_sessions_user on public.workout_sessions(user_id);
create index if not exists idx_workout_sessions_started on public.workout_sessions(started_at);

create table if not exists public.workout_exercises (
  id text primary key,
  workout_session_id text not null references public.workout_sessions(id) on delete cascade,
  exercise_id text,
  sort_order int,
  superset_group text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_workout_exercises_session on public.workout_exercises(workout_session_id);

create table if not exists public.workout_sets (
  id text primary key,
  workout_exercise_id text not null references public.workout_exercises(id) on delete cascade,
  sort_order int,
  set_type text,
  weight_kg double precision,
  reps int,
  duration_seconds int,
  distance_meters double precision,
  rpe double precision,
  rir double precision,
  is_completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_workout_sets_exercise on public.workout_sets(workout_exercise_id);

create table if not exists public.diary_days (
  id text primary key,
  user_id text not null,
  local_date text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, local_date)
);
create index if not exists idx_diary_days_user_date on public.diary_days(user_id, local_date);

create table if not exists public.food_items (
  id text primary key,
  user_id text,
  brand_name text,
  name text not null,
  serving_size double precision,
  serving_unit text,
  grams_per_serving double precision,
  calories double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision,
  fiber_g double precision,
  sodium_mg double precision,
  source_provider text,
  is_verified boolean not null default false,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_food_items_user on public.food_items(user_id);

create table if not exists public.diary_entries (
  id text primary key,
  user_id text not null,
  diary_day_id text references public.diary_days(id) on delete set null,
  local_date text,
  meal_slot text,
  food_item_id text,
  servings double precision,
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_diary_entries_user_date on public.diary_entries(user_id, local_date);

create table if not exists public.water_logs (
  id text primary key,
  user_id text not null,
  local_date text not null,
  amount_ml double precision not null,
  logged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_water_logs_user_date on public.water_logs(user_id, local_date);

-- Updated-at triggers
create or replace trigger set_updated_at_user_profiles
before update on public.user_profiles
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_goal_settings
before update on public.goal_settings
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_workout_sessions
before update on public.workout_sessions
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_workout_exercises
before update on public.workout_exercises
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_workout_sets
before update on public.workout_sets
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_diary_days
before update on public.diary_days
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_food_items
before update on public.food_items
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_diary_entries
before update on public.diary_entries
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_water_logs
before update on public.water_logs
for each row execute function public.set_updated_at();

-- RLS
alter table public.sync_events enable row level security;
alter table public.user_profiles enable row level security;
alter table public.goal_settings enable row level security;
alter table public.workout_sessions enable row level security;
alter table public.workout_exercises enable row level security;
alter table public.workout_sets enable row level security;
alter table public.diary_days enable row level security;
alter table public.food_items enable row level security;
alter table public.diary_entries enable row level security;
alter table public.water_logs enable row level security;

-- Own rows only, based on auth.uid() text.
drop policy if exists sync_events_owner_all on public.sync_events;
create policy sync_events_owner_all on public.sync_events
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists user_profiles_owner_all on public.user_profiles;
create policy user_profiles_owner_all on public.user_profiles
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists goal_settings_owner_all on public.goal_settings;
create policy goal_settings_owner_all on public.goal_settings
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists workout_sessions_owner_all on public.workout_sessions;
create policy workout_sessions_owner_all on public.workout_sessions
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists workout_exercises_owner_all on public.workout_exercises;
create policy workout_exercises_owner_all on public.workout_exercises
for all using (
  exists (
    select 1 from public.workout_sessions s
    where s.id = workout_exercises.workout_session_id
      and s.user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1 from public.workout_sessions s
    where s.id = workout_exercises.workout_session_id
      and s.user_id = auth.uid()::text
  )
);

drop policy if exists workout_sets_owner_all on public.workout_sets;
create policy workout_sets_owner_all on public.workout_sets
for all using (
  exists (
    select 1
    from public.workout_exercises e
    join public.workout_sessions s on s.id = e.workout_session_id
    where e.id = workout_sets.workout_exercise_id
      and s.user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.workout_exercises e
    join public.workout_sessions s on s.id = e.workout_session_id
    where e.id = workout_sets.workout_exercise_id
      and s.user_id = auth.uid()::text
  )
);

drop policy if exists diary_days_owner_all on public.diary_days;
create policy diary_days_owner_all on public.diary_days
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists diary_entries_owner_all on public.diary_entries;
create policy diary_entries_owner_all on public.diary_entries
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists water_logs_owner_all on public.water_logs;
create policy water_logs_owner_all on public.water_logs
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists food_items_select_global_or_own on public.food_items;
create policy food_items_select_global_or_own on public.food_items
for select using (user_id is null or user_id = auth.uid()::text);

drop policy if exists food_items_own_write on public.food_items;
create policy food_items_own_write on public.food_items
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
