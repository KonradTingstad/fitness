-- Fix false-positive drink classification caused by substring matching (e.g. "potetgull", "leverpostei").
-- Applies strict token/phrase matching for Oda snapshot rows and reclassifies existing records.

with normalized as (
  select
    id,
    ' ' || regexp_replace(unaccent(lower(coalesce(name, ''))), '[^a-z0-9]+', ' ', 'g') || ' ' as norm_name,
    ' ' || regexp_replace(unaccent(lower(coalesce(brand_name, ''))), '[^a-z0-9]+', ' ', 'g') || ' ' as norm_brand
  from public.food_items
  where deleted_at is null
    and source_provider = 'oda_private_snapshot'
),
strict_drink as (
  select id
  from normalized
  where
    norm_name like '% vann %'
    or norm_name like '% water %'
    or norm_name like '% brus %'
    or norm_name like '% soda %'
    or norm_name like '% cola %'
    or norm_name like '% juice %'
    or norm_name like '% smoothie %'
    or norm_name like '% sportsdrikk %'
    or norm_name like '% energidrikk %'
    or norm_name like '% energy drink %'
    or norm_name like '% drikk %'
    or norm_name like '% drink %'
    or norm_name like '% kaffe %'
    or norm_name like '% coffee %'
    or norm_name like '% te %'
    or norm_name like '% iste %'
    or norm_name like '% saft %'
    or norm_name like '% milkshake %'
    or norm_name like '% kombucha %'
    or norm_name like '% lemonade %'
    or norm_name like '% isoton %'
    or norm_brand like '% monster %'
    or norm_brand like '% red bull %'
    or norm_brand like '% battery %'
    or norm_brand like '% coca cola %'
    or norm_brand like '% pepsi %'
    or norm_brand like '% fanta %'
    or norm_brand like '% sprite %'
)
update public.food_items f
set item_type = case when d.id is null then 'food' else 'drink' end
from normalized n
left join strict_drink d on d.id = n.id
where f.id = n.id
  and f.deleted_at is null
  and coalesce(f.item_type, 'food') <> case when d.id is null then 'food' else 'drink' end;
