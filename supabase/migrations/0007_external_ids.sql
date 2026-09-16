-- =====================================================================
-- DAYSTAR OS — remember where an imported row came from  (0007)
--
-- The product import has to be re-runnable: Showmore's export is the source of
-- truth for the catalogue and will be imported again whenever it changes. Without
-- a stable link back to the source row, a second import either duplicates all 102
-- products or has to guess at matching them by name — and 商品編號(sku) is empty on
-- 314 of 320 rows, so it cannot be that link.
--
-- Showmore's own `product_id` / `variant_id` (e.g. `product-qqGgbHER5wMJ6i3Th9pYSJ`)
-- are stable across exports, so they are stored and become the upsert key.
--
-- external_source names the system, so a later Shopee or Shopline import cannot
-- collide with a Showmore id that happens to look the same.
--
-- Re-runnable: every statement is guarded.
-- =====================================================================

alter table public.products
  add column if not exists external_source text,
  add column if not exists external_id     text;

alter table public.product_variants
  add column if not exists external_source text,
  add column if not exists external_id     text;

-- Partial unique indexes: rows created by hand have no external id and must not
-- collide with each other on NULL.
create unique index if not exists products_external_key
  on public.products (organization_id, external_source, external_id)
  where external_id is not null;

create unique index if not exists product_variants_external_key
  on public.product_variants (product_id, external_source, external_id)
  where external_id is not null;

comment on column public.products.external_id is
  'Identifier in the source system (Showmore product_id). NULL for rows created in DAYSTAR OS.';
comment on column public.product_variants.external_id is
  'Identifier in the source system (Showmore variant_id). NULL for rows created in DAYSTAR OS.';
