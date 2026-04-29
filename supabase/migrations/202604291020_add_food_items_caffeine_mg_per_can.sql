-- Add caffeine value per package/can for imported foods where this data is available.

alter table public.food_items
  add column if not exists caffeine_mg_per_can double precision;
