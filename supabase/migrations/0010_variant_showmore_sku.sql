-- =====================================================================
-- DAYSTAR OS — store Showmore's own SKU on each variant  (0010)
--
-- Part of the Showmore order-sync build (2026-09-21): incoming order line
-- items carry Showmore's own SKU text (when the merchant filled it in),
-- not Showmore's stable product_id/variant_id — those aren't in the order
-- payload at all. To match an order item to a row in this app, we need
-- Showmore's own SKU stored somewhere.
--
-- It was NOT already there. `product_variants.sku` / `products.sku` hold
-- *our own* generated codes (`DS-0007`, `DS-0007-02`, ...) — see
-- lib/import/productImportPlan.ts. The importer already reads Showmore's
-- `商品編號(sku)` column into `ParsedVariant.sku`, but until this change
-- that value was parsed and then discarded; it never reached the database.
--
-- This column is the fix: it holds Showmore's own SKU verbatim (nullable —
-- most existing rows have none, see lib/import/showmoreProducts.ts's note
-- that 314 of 320 rows had it blank on the 2026-09-07 export). The importer
-- (settings/import/actions.ts) is updated alongside this migration to
-- actually write it. As Lucas fills in SKUs on Showmore's side and
-- re-imports, this column starts populating and order-item matching gets
-- stronger — without either side needing to change again.
--
-- Variant grain only: the parser gives every product at least one variant
-- row (unvarianted products still get a single variant), so there is no
-- separate product-level SKU to carry.
--
-- Re-runnable: the statement is guarded.
-- =====================================================================

alter table public.product_variants
  add column if not exists showmore_sku text;

comment on column public.product_variants.showmore_sku is
  'Showmore''s own SKU for this variant (商品編號(sku) on their export), verbatim and separate from this app''s generated sku column. NULL when Showmore has no SKU set for it. Used to match incoming order line items during the Showmore order sync.';
