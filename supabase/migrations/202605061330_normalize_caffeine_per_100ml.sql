-- Normalize caffeine to per-100ml for drinks while keeping legacy per-can values.

alter table public.food_items
  add column if not exists caffeine_mg_per_100ml double precision;

create or replace function public.parse_volume_ml_from_text(input_text text)
returns double precision
language plpgsql
immutable
as $$
declare
  normalized text;
  m text[];
  pack_count double precision;
  pack_size double precision;
  unit text;
begin
  if input_text is null or btrim(input_text) = '' then
    return null;
  end if;

  normalized := lower(replace(input_text, ',', '.'));

  m := regexp_match(normalized, '(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|dl|l)\b');
  if m is not null then
    pack_count := m[1]::double precision;
    pack_size := m[2]::double precision;
    unit := m[3];

    if unit = 'l' then
      pack_size := pack_size * 1000;
    elsif unit = 'cl' then
      pack_size := pack_size * 10;
    elsif unit = 'dl' then
      pack_size := pack_size * 100;
    end if;

    return pack_count * pack_size;
  end if;

  m := regexp_match(normalized, '(\d+(?:\.\d+)?)\s*(ml|cl|dl|l)\b');
  if m is null then
    return null;
  end if;

  pack_size := m[1]::double precision;
  unit := m[2];

  if unit = 'l' then
    return pack_size * 1000;
  elsif unit = 'cl' then
    return pack_size * 10;
  elsif unit = 'dl' then
    return pack_size * 100;
  end if;

  return pack_size;
end;
$$;

with caffeine_candidates as (
  select
    id,
    caffeine_mg_per_can,
    public.parse_volume_ml_from_text(coalesce(package_size, variant, name)) as volume_ml
  from public.food_items
  where deleted_at is null
    and coalesce(caffeine_mg_per_100ml, 0) <= 0
    and caffeine_mg_per_can is not null
    and caffeine_mg_per_can > 0
)
update public.food_items f
set caffeine_mg_per_100ml = round(((c.caffeine_mg_per_can / c.volume_ml) * 100)::numeric, 3)::double precision
from caffeine_candidates c
where f.id = c.id
  and c.volume_ml is not null
  and c.volume_ml > 0;

-- Existing Oda drinks in this project are modeled with per-100 nutrition values.
-- Align serving_unit to ml where the row is clearly a drink baseline entry.
update public.food_items
set serving_unit = 'ml'
where deleted_at is null
  and coalesce(item_type, 'food') = 'drink'
  and coalesce(serving_size, 0) = 100
  and coalesce(grams_per_serving, 0) = 100
  and lower(coalesce(serving_unit, 'g')) in ('g', 'gram', 'grams');

create or replace view public.food_items_caffeine_volume_gaps as
select
  f.id,
  f.name,
  f.brand_name,
  f.item_type,
  f.package_size,
  f.variant,
  f.caffeine_mg_per_can,
  f.caffeine_mg_per_100ml,
  public.parse_volume_ml_from_text(coalesce(f.package_size, f.variant, f.name)) as inferred_volume_ml
from public.food_items f
where f.deleted_at is null
  and coalesce(f.item_type, 'food') = 'drink'
  and coalesce(f.caffeine_mg_per_can, 0) > 0
  and coalesce(f.caffeine_mg_per_100ml, 0) <= 0;

drop function if exists public.search_food_items_snapshot(text, integer, text);

create function public.search_food_items_snapshot(
  search_query text,
  max_results integer default 50,
  search_item_type text default null
)
returns table (
  id text,
  name text,
  brand_name text,
  item_type text,
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
  caffeine_mg_per_100ml double precision,
  caffeine_mg_per_can double precision,
  kj_per_100 double precision,
  calories_per_100 double precision,
  protein_per_100 double precision,
  carbs_per_100 double precision,
  sugar_per_100 double precision,
  fat_per_100 double precision,
  saturated_fat_per_100 double precision,
  fiber_per_100 double precision,
  salt_per_100 double precision,
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
    select
      nullif(trim(search_query), '') as term,
      case
        when search_item_type is null or trim(search_item_type) = '' or trim(search_item_type) = 'all' then null
        else trim(search_item_type)
      end as requested_item_type
  )
  select
    f.id,
    f.name,
    f.brand_name,
    coalesce(f.item_type, 'food') as item_type,
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
    f.caffeine_mg_per_100ml,
    f.caffeine_mg_per_can,
    f.kj_per_100,
    f.calories_per_100,
    f.protein_per_100,
    f.carbs_per_100,
    f.sugar_per_100,
    f.fat_per_100,
    f.saturated_fat_per_100,
    f.fiber_per_100,
    f.salt_per_100,
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
      s.requested_item_type is null
      or coalesce(f.item_type, 'food') = s.requested_item_type
    )
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

grant execute on function public.search_food_items_snapshot(text, integer, text) to anon;
grant execute on function public.search_food_items_snapshot(text, integer, text) to authenticated;
