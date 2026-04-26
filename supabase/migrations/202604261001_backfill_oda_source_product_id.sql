-- Backfill source_product_id for rows imported before extended schema existed.

update public.food_items
set
  source_product_id = regexp_replace(id, '^oda_', ''),
  private_snapshot = true,
  imported_at = coalesce(imported_at, now())
where source_provider = 'oda_private_snapshot'
  and source_product_id is null
  and id ~ '^oda_[0-9]+$';
