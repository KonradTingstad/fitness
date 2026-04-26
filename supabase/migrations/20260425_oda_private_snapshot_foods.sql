-- Extend public.food_items for one-time private Oda nutrition snapshot imports.

create extension if not exists pg_trgm;
create extension if not exists unaccent;

alter table public.food_items add column if not exists variant text;
alter table public.food_items add column if not exists package_size text;
alter table public.food_items add column if not exists barcode text;
alter table public.food_items add column if not exists sugar_g double precision;
alter table public.food_items add column if not exists saturated_fat_g double precision;
alter table public.food_items add column if not exists source_product_id text;
alter table public.food_items add column if not exists source_url text;
alter table public.food_items add column if not exists api_url text;
alter table public.food_items add column if not exists imported_at timestamptz;
alter table public.food_items add column if not exists private_snapshot boolean not null default false;
alter table public.food_items add column if not exists kj_per_100 double precision;
alter table public.food_items add column if not exists calories_per_100 double precision;
alter table public.food_items add column if not exists protein_per_100 double precision;
alter table public.food_items add column if not exists carbs_per_100 double precision;
alter table public.food_items add column if not exists sugar_per_100 double precision;
alter table public.food_items add column if not exists fat_per_100 double precision;
alter table public.food_items add column if not exists saturated_fat_per_100 double precision;
alter table public.food_items add column if not exists fiber_per_100 double precision;
alter table public.food_items add column if not exists salt_per_100 double precision;
alter table public.food_items add column if not exists ingredients text;
alter table public.food_items add column if not exists allergens text;
alter table public.food_items add column if not exists raw_source_data jsonb;

create index if not exists idx_food_items_brand_name on public.food_items(brand_name);
create index if not exists idx_food_items_source_provider on public.food_items(source_provider);
create index if not exists idx_food_items_source_product_id on public.food_items(source_product_id);
create index if not exists idx_food_items_name_trgm on public.food_items using gin (name gin_trgm_ops);
create index if not exists idx_food_items_brand_name_trgm on public.food_items using gin (brand_name gin_trgm_ops);

create unique index if not exists idx_food_items_source_provider_product_id_unique
  on public.food_items(source_provider, source_product_id)
  where source_product_id is not null;

create unique index if not exists idx_food_items_oda_barcode_unique
  on public.food_items(barcode)
  where barcode is not null and source_provider = 'oda_private_snapshot';

create or replace function public.search_food_items_snapshot(search_query text, max_results integer default 50)
returns table (
  id text,
  name text,
  brand_name text,
  serving_size double precision,
  serving_unit text,
  grams_per_serving double precision,
  calories double precision,
  protein_g double precision,
  carbs_g double precision,
  fat_g double precision,
  fiber_g double precision,
  sugar_g double precision,
  saturated_fat_g double precision,
  sodium_mg double precision,
  barcode text,
  source_provider text,
  is_verified boolean,
  is_custom boolean,
  private_snapshot boolean,
  imported_at timestamptz
)
language sql
stable
as $$
  with search_term as (
    select nullif(trim(search_query), '') as term
  )
  select
    f.id,
    f.name,
    f.brand_name,
    f.serving_size,
    f.serving_unit,
    f.grams_per_serving,
    f.calories,
    f.protein_g,
    f.carbs_g,
    f.fat_g,
    f.fiber_g,
    f.sugar_g,
    f.saturated_fat_g,
    f.sodium_mg,
    f.barcode,
    f.source_provider,
    f.is_verified,
    f.is_custom,
    f.private_snapshot,
    f.imported_at
  from public.food_items f
  cross join search_term s
  where f.deleted_at is null
    and (f.user_id is null or f.user_id = auth.uid()::text)
    and (
      s.term is null
      or unaccent(lower(f.name)) like '%' || unaccent(lower(s.term)) || '%'
      or unaccent(lower(coalesce(f.brand_name, ''))) like '%' || unaccent(lower(s.term)) || '%'
      or coalesce(f.barcode, '') ilike '%' || s.term || '%'
    )
  order by
    case
      when s.term is null then 0
      else greatest(
        similarity(unaccent(lower(f.name)), unaccent(lower(s.term))),
        similarity(unaccent(lower(coalesce(f.brand_name, ''))), unaccent(lower(s.term)))
      )
    end desc,
    f.is_verified desc,
    f.name asc
  limit least(greatest(coalesce(max_results, 50), 1), 100);
$$;

grant execute on function public.search_food_items_snapshot(text, integer) to anon;
grant execute on function public.search_food_items_snapshot(text, integer) to authenticated;
grant select on table public.food_items to anon;
grant select on table public.food_items to authenticated;
