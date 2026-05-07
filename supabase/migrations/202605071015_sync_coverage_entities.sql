-- Add missing sync entities and columns used by the local-first queue.

alter table public.goal_settings
  add column if not exists goal text,
  add column if not exists activity_level text;

create table if not exists public.users (
  id text primary key,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.unit_preferences (
  user_id text primary key,
  body_weight_unit text,
  load_unit text,
  distance_unit text,
  volume_unit text,
  energy_unit text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.caffeine_logs (
  id text primary key,
  user_id text not null,
  local_date text not null,
  drink_name text not null,
  caffeine_mg double precision not null,
  amount_ml double precision,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_caffeine_logs_user_date on public.caffeine_logs(user_id, local_date);

create table if not exists public.routines (
  id text primary key,
  user_id text not null,
  name text not null,
  notes text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_routines_user on public.routines(user_id);

create table if not exists public.routine_exercises (
  id text primary key,
  routine_id text not null references public.routines(id) on delete cascade,
  exercise_id text not null,
  sort_order int not null,
  superset_group text,
  notes text,
  default_rest_seconds int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_routine_exercises_routine on public.routine_exercises(routine_id);

create table if not exists public.routine_exercise_set_templates (
  id text primary key,
  routine_exercise_id text not null references public.routine_exercises(id) on delete cascade,
  sort_order int not null,
  set_type text not null,
  target_reps_min int,
  target_reps_max int,
  target_weight_kg double precision,
  duration_seconds int,
  distance_meters double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_routine_sets_routine_exercise on public.routine_exercise_set_templates(routine_exercise_id);

create table if not exists public.workout_program_days (
  id text primary key,
  user_id text not null,
  local_date text not null,
  activity_type text not null,
  title text not null,
  routine_id text references public.routines(id) on delete set null,
  estimated_duration_minutes int,
  metadata text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists idx_workout_program_days_user_date on public.workout_program_days(user_id, local_date);
create index if not exists idx_workout_program_days_user_activity on public.workout_program_days(user_id, activity_type);

create table if not exists public.workout_program_day_outcomes (
  id text primary key,
  user_id text not null,
  local_date text not null,
  status text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists idx_workout_program_day_outcomes_user_date on public.workout_program_day_outcomes(user_id, local_date);
create index if not exists idx_workout_program_day_outcomes_user_status on public.workout_program_day_outcomes(user_id, status);

create or replace trigger set_updated_at_users
before update on public.users
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_unit_preferences
before update on public.unit_preferences
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_caffeine_logs
before update on public.caffeine_logs
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_routines
before update on public.routines
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_routine_exercises
before update on public.routine_exercises
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_routine_exercise_set_templates
before update on public.routine_exercise_set_templates
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_workout_program_days
before update on public.workout_program_days
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_workout_program_day_outcomes
before update on public.workout_program_day_outcomes
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.unit_preferences enable row level security;
alter table public.caffeine_logs enable row level security;
alter table public.routines enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.routine_exercise_set_templates enable row level security;
alter table public.workout_program_days enable row level security;
alter table public.workout_program_day_outcomes enable row level security;

drop policy if exists users_owner_all on public.users;
create policy users_owner_all on public.users
for all using (id = auth.uid()::text) with check (id = auth.uid()::text);

drop policy if exists unit_preferences_owner_all on public.unit_preferences;
create policy unit_preferences_owner_all on public.unit_preferences
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists caffeine_logs_owner_all on public.caffeine_logs;
create policy caffeine_logs_owner_all on public.caffeine_logs
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists routines_owner_all on public.routines;
create policy routines_owner_all on public.routines
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists routine_exercises_owner_all on public.routine_exercises;
create policy routine_exercises_owner_all on public.routine_exercises
for all using (
  exists (
    select 1
    from public.routines r
    where r.id = routine_exercises.routine_id
      and r.user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.routines r
    where r.id = routine_exercises.routine_id
      and r.user_id = auth.uid()::text
  )
);

drop policy if exists routine_exercise_set_templates_owner_all on public.routine_exercise_set_templates;
create policy routine_exercise_set_templates_owner_all on public.routine_exercise_set_templates
for all using (
  exists (
    select 1
    from public.routine_exercises re
    join public.routines r on r.id = re.routine_id
    where re.id = routine_exercise_set_templates.routine_exercise_id
      and r.user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.routine_exercises re
    join public.routines r on r.id = re.routine_id
    where re.id = routine_exercise_set_templates.routine_exercise_id
      and r.user_id = auth.uid()::text
  )
);

drop policy if exists workout_program_days_owner_all on public.workout_program_days;
create policy workout_program_days_owner_all on public.workout_program_days
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);

drop policy if exists workout_program_day_outcomes_owner_all on public.workout_program_day_outcomes;
create policy workout_program_day_outcomes_owner_all on public.workout_program_day_outcomes
for all using (user_id = auth.uid()::text) with check (user_id = auth.uid()::text);
