-- Add item_type on food_items so the app can separate foods and drinks in search flows.

alter table public.food_items
  add column if not exists item_type text not null default 'food';

update public.food_items
set item_type = 'food'
where item_type is null or item_type not in ('food', 'drink');

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'food_items_item_type_check'
      and conrelid = 'public.food_items'::regclass
  ) then
    alter table public.food_items
      add constraint food_items_item_type_check check (item_type in ('food', 'drink'));
  end if;
end
$$;

create index if not exists idx_food_items_item_type on public.food_items(item_type);

-- Lightweight heuristic backfill for obvious drink products.
update public.food_items
set item_type = 'drink'
where deleted_at is null
  and coalesce(item_type, 'food') = 'food'
  and (
    lower(name) like any (array[
      '%vann%', '%water%', '%brus%', '%soda%', '%cola%',
      '%juice%', '%smoothie%', '%sportsdrikk%', '%energidrikk%',
      '%energy drink%', '%kaffe%', '%coffee%', '%te%', '%saft%',
      '%milkshake%', '%kombucha%', '%isoton%', '%lemonade%'
    ])
    or lower(coalesce(brand_name, '')) like any (array[
      '%monster%', '%red bull%', '%battery%', '%coca-cola%',
      '%pepsi%', '%fanta%', '%sprite%'
    ])
  );

drop function if exists public.search_food_items_snapshot(text, integer);
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
