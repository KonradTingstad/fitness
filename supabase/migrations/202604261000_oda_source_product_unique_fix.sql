-- Ensure ON CONFLICT(source_provider, source_product_id) can be inferred.
-- The previous index was partial and cannot be used reliably by PostgREST upsert.

drop index if exists public.idx_food_items_source_provider_product_id_unique;

create unique index if not exists idx_food_items_source_provider_product_id_unique
  on public.food_items(source_provider, source_product_id);
