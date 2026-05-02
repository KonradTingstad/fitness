create table if not exists public.saved_meals (
  id text primary key,
  user_id text not null,
  name text not null,
  notes text,
  is_favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_saved_meals_user on public.saved_meals(user_id);

create table if not exists public.saved_meal_items (
  id text primary key,
  saved_meal_id text not null references public.saved_meals(id) on delete cascade,
  food_item_id text not null references public.food_items(id) on delete restrict,
  servings double precision not null,
  meal_slot text,
  quantity_type text,
  total_grams double precision,
  total_calories double precision,
  total_protein_g double precision,
  total_carbs_g double precision,
  total_fat_g double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists idx_saved_meal_items_meal on public.saved_meal_items(saved_meal_id);

alter table public.saved_meal_items
  add column if not exists quantity_type text,
  add column if not exists total_grams double precision,
  add column if not exists total_calories double precision,
  add column if not exists total_protein_g double precision,
  add column if not exists total_carbs_g double precision,
  add column if not exists total_fat_g double precision;

alter table public.diary_entries
  add column if not exists source_saved_meal_id text references public.saved_meals(id) on delete set null;

create or replace trigger set_updated_at_saved_meals
before update on public.saved_meals
for each row execute function public.set_updated_at();

create or replace trigger set_updated_at_saved_meal_items
before update on public.saved_meal_items
for each row execute function public.set_updated_at();
