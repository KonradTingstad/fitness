-- Separate nutrition basis from logging defaults for food/drink items.

alter table public.food_items
  add column if not exists product_type text;

alter table public.food_items
  add column if not exists base_unit text;

alter table public.food_items
  add column if not exists nutrition_basis text;

alter table public.food_items
  add column if not exists serving_mode text;

alter table public.food_items
  add column if not exists serving_label text;

-- Keep existing package_size (text) as raw source label and store normalized numeric size separately.
alter table public.food_items
  add column if not exists package_size_value double precision;

alter table public.food_items
  add column if not exists package_unit text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_items_product_type_check'
  ) then
    alter table public.food_items
      add constraint food_items_product_type_check
      check (product_type is null or product_type in ('food', 'drink'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_items_base_unit_check'
  ) then
    alter table public.food_items
      add constraint food_items_base_unit_check
      check (base_unit is null or base_unit in ('g', 'ml'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_items_nutrition_basis_check'
  ) then
    alter table public.food_items
      add constraint food_items_nutrition_basis_check
      check (nutrition_basis is null or nutrition_basis in ('per_100g', 'per_100ml'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_items_serving_mode_check'
  ) then
    alter table public.food_items
      add constraint food_items_serving_mode_check
      check (serving_mode is null or serving_mode in ('fixed_package', 'suggested_amount', 'custom_amount'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_items_package_unit_check'
  ) then
    alter table public.food_items
      add constraint food_items_package_unit_check
      check (package_unit is null or package_unit in ('g', 'ml'));
  end if;
end;
$$;

create index if not exists idx_food_items_product_type on public.food_items(product_type);
create index if not exists idx_food_items_serving_mode on public.food_items(serving_mode);

create or replace function public.parse_measurement_from_text(input_text text)
returns table (
  unit_value double precision,
  total_value double precision,
  base_unit text
)
language plpgsql
immutable
as $$
declare
  normalized text;
  m text[];
  pack_count double precision;
  pack_size double precision;
  unit_token text;
  converted double precision;
begin
  if input_text is null or btrim(input_text) = '' then
    return;
  end if;

  normalized := lower(replace(input_text, ',', '.'));

  -- Multipack formats: "6 x 250 ml", "4x0.33 l", "3 × 55 g"
  m := regexp_match(normalized, '(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)\b');
  if m is not null then
    pack_count := m[1]::double precision;
    pack_size := m[2]::double precision;
    unit_token := m[3];

    if unit_token = 'l' then
      converted := pack_size * 1000;
      return query select converted, converted * pack_count, 'ml'::text;
      return;
    elsif unit_token = 'cl' then
      converted := pack_size * 10;
      return query select converted, converted * pack_count, 'ml'::text;
      return;
    elsif unit_token = 'dl' then
      converted := pack_size * 100;
      return query select converted, converted * pack_count, 'ml'::text;
      return;
    elsif unit_token = 'ml' then
      converted := pack_size;
      return query select converted, converted * pack_count, 'ml'::text;
      return;
    elsif unit_token = 'kg' then
      converted := pack_size * 1000;
      return query select converted, converted * pack_count, 'g'::text;
      return;
    elsif unit_token = 'g' then
      converted := pack_size;
      return query select converted, converted * pack_count, 'g'::text;
      return;
    end if;
  end if;

  m := regexp_match(normalized, '(\d+(?:\.\d+)?)\s*(ml|cl|dl|l|g|kg)\b');
  if m is null then
    return;
  end if;

  pack_size := m[1]::double precision;
  unit_token := m[2];

  if unit_token = 'l' then
    converted := pack_size * 1000;
    return query select converted, converted, 'ml'::text;
    return;
  elsif unit_token = 'cl' then
    converted := pack_size * 10;
    return query select converted, converted, 'ml'::text;
    return;
  elsif unit_token = 'dl' then
    converted := pack_size * 100;
    return query select converted, converted, 'ml'::text;
    return;
  elsif unit_token = 'ml' then
    converted := pack_size;
    return query select converted, converted, 'ml'::text;
    return;
  elsif unit_token = 'kg' then
    converted := pack_size * 1000;
    return query select converted, converted, 'g'::text;
    return;
  elsif unit_token = 'g' then
    converted := pack_size;
    return query select converted, converted, 'g'::text;
    return;
  end if;
end;
$$;

with parsed as (
  select
    f.id,
    p.unit_value,
    p.total_value,
    p.base_unit
  from public.food_items f
  left join lateral public.parse_measurement_from_text(coalesce(f.package_size, f.variant, f.name)) p on true
  where f.deleted_at is null
)
update public.food_items f
set
  package_size_value = coalesce(f.package_size_value, parsed.total_value),
  package_unit = coalesce(f.package_unit, parsed.base_unit)
from parsed
where f.id = parsed.id
  and (
    (f.package_size_value is null and parsed.total_value is not null)
    or (f.package_unit is null and parsed.base_unit is not null)
  );

update public.food_items
set product_type = case
  when coalesce(item_type, 'food') = 'drink' then 'drink'
  when lower(coalesce(serving_unit, '')) in ('ml', 'cl', 'dl', 'l') then 'drink'
  else 'food'
end
where product_type is null
  and deleted_at is null;

update public.food_items
set base_unit = case
  when product_type = 'drink' then 'ml'
  when lower(coalesce(serving_unit, '')) in ('ml', 'cl', 'dl', 'l') then 'ml'
  else 'g'
end
where base_unit is null
  and deleted_at is null;

update public.food_items
set nutrition_basis = case
  when base_unit = 'ml' then 'per_100ml'
  else 'per_100g'
end
where nutrition_basis is null
  and deleted_at is null;

with serving_candidates as (
  select
    f.id,
    p.unit_value,
    p.base_unit,
    case
      when coalesce(f.product_type, 'food') = 'drink' then
        case
          when unaccent(lower(coalesce(f.name, ''))) similar to '%(flaske|bottle|juice)%' then '1 flaske'
          else '1 boks'
        end
      else
        case
          when unaccent(lower(coalesce(f.name, ''))) similar to '%(bar|proteinbar)%' then '1 bar'
          when unaccent(lower(coalesce(f.name, ''))) similar to '%(yoghurt|yogurt|beger)%' then '1 beger'
          else null
        end
    end as inferred_label
  from public.food_items f
  left join lateral public.parse_measurement_from_text(coalesce(f.package_size, f.variant, f.name)) p on true
  where f.deleted_at is null
)
update public.food_items f
set
  serving_mode = coalesce(
    f.serving_mode,
    case
      when c.unit_value is not null and c.base_unit in ('g', 'ml') then 'fixed_package'
      when f.serving_label is not null and btrim(f.serving_label) <> '' and coalesce(f.serving_size, 0) > 0 then 'suggested_amount'
      else 'custom_amount'
    end
  ),
  serving_label = coalesce(f.serving_label, c.inferred_label),
  serving_size = case
    when c.unit_value is not null and c.base_unit in ('g', 'ml') and coalesce(f.serving_size, 0) <= 0 then c.unit_value
    when c.unit_value is not null and c.base_unit in ('g', 'ml') and coalesce(f.serving_size, 0) = 100 then c.unit_value
    else f.serving_size
  end,
  serving_unit = case
    when c.unit_value is not null and c.base_unit in ('g', 'ml') and (f.serving_unit is null or btrim(f.serving_unit) = '' or lower(f.serving_unit) in ('g', 'gram', 'grams', 'ml', 'milliliter', 'milliliters'))
      then c.base_unit
    else f.serving_unit
  end,
  grams_per_serving = case
    when c.unit_value is not null and c.base_unit in ('g', 'ml') and (coalesce(f.grams_per_serving, 0) <= 0 or coalesce(f.grams_per_serving, 0) = 100)
      then c.unit_value
    else f.grams_per_serving
  end
from serving_candidates c
where f.id = c.id
  and f.deleted_at is null;

update public.food_items
set serving_mode = 'custom_amount'
where serving_mode is null
  and deleted_at is null;

-- Reconcile classification after serving/unit backfill so legacy "100 g drinks" are corrected.
update public.food_items
set product_type = case
  when coalesce(item_type, 'food') = 'drink' then 'drink'
  when lower(coalesce(serving_unit, '')) in ('ml', 'cl', 'dl', 'l') then 'drink'
  when coalesce(package_unit, '') = 'ml' then 'drink'
  when coalesce(caffeine_mg_per_100ml, 0) > 0 then 'drink'
  else 'food'
end
where deleted_at is null
  and (
    product_type is null
    or product_type not in ('food', 'drink')
    or (
      product_type = 'food'
      and (
        coalesce(item_type, 'food') = 'drink'
        or lower(coalesce(serving_unit, '')) in ('ml', 'cl', 'dl', 'l')
        or coalesce(package_unit, '') = 'ml'
        or coalesce(caffeine_mg_per_100ml, 0) > 0
      )
    )
  );

update public.food_items
set base_unit = case
  when product_type = 'drink' then 'ml'
  else 'g'
end
where deleted_at is null
  and (
    base_unit is null
    or base_unit not in ('g', 'ml')
    or (product_type = 'drink' and base_unit <> 'ml')
    or (product_type <> 'drink' and base_unit <> 'g')
  );

update public.food_items
set nutrition_basis = case
  when base_unit = 'ml' then 'per_100ml'
  else 'per_100g'
end
where deleted_at is null
  and (
    nutrition_basis is null
    or nutrition_basis not in ('per_100g', 'per_100ml')
    or (base_unit = 'ml' and nutrition_basis <> 'per_100ml')
    or (base_unit = 'g' and nutrition_basis <> 'per_100g')
  );

-- Keep legacy and new product type fields aligned for app compatibility.
update public.food_items
set item_type = case when product_type = 'drink' then 'drink' else 'food' end
where deleted_at is null
  and (
    item_type is null
    or item_type not in ('food', 'drink')
    or item_type <> case when product_type = 'drink' then 'drink' else 'food' end
  );

-- Snapshot search function with serving/basis metadata.
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
  product_type text,
  base_unit text,
  nutrition_basis text,
  serving_mode text,
  serving_label text,
  serving_size double precision,
  serving_unit text,
  grams_per_serving double precision,
  package_size text,
  package_size_value double precision,
  package_unit text,
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
    coalesce(f.product_type, coalesce(f.item_type, 'food')) as product_type,
    f.base_unit,
    f.nutrition_basis,
    f.serving_mode,
    f.serving_label,
    f.serving_size,
    f.serving_unit,
    f.grams_per_serving,
    f.package_size,
    f.package_size_value,
    f.package_unit,
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
      or coalesce(f.product_type, coalesce(f.item_type, 'food')) = s.requested_item_type
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
