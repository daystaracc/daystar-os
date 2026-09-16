-- =====================================================================
-- DAYSTAR OS — stock and product sales move to variant grain  (0006)
--
-- Showmore sells at variant grain: ICED OUT STAR LINKS BRACELET exists as
-- SILVER 銀/18CM and GOLD 金/18CM, with separate stock and sometimes separate
-- prices (8MM DIAMOND STUD EARRINGS is NT$480 a pair, NT$249 a single). The
-- product export carries 官網庫存 per variant — 3,538 units across 320 variants.
--
-- `inventory` and `product_sales_daily` were keyed on product_id alone, so those
-- could not hold separate stock or separate revenue.
--
-- Re-runnable: every statement is guarded, so applying it twice is harmless.
--
-- variant_id is nullable: products with no variants keep a single row with
-- variant_id IS NULL, and existing rows are unaffected. The unique constraints
-- are widened to include it. Postgres treats NULLs as distinct in a plain UNIQUE,
-- which would allow duplicate product-level rows, so NULLS NOT DISTINCT is used
-- to keep "one row per product per day" true for unvarianted products.
-- =====================================================================

alter table public.inventory
  add column if not exists variant_id uuid references public.product_variants(id) on delete cascade;

alter table public.product_sales_daily
  add column if not exists variant_id uuid references public.product_variants(id) on delete cascade;

alter table public.inventory drop constraint if exists inventory_organization_id_product_id_key;
alter table public.inventory drop constraint if exists inventory_org_product_variant_key;
alter table public.inventory
  add constraint inventory_org_product_variant_key
  unique nulls not distinct (organization_id, product_id, variant_id);

alter table public.product_sales_daily drop constraint if exists product_sales_daily_organization_id_date_product_id_key;
alter table public.product_sales_daily drop constraint if exists product_sales_daily_org_date_product_variant_key;
alter table public.product_sales_daily
  add constraint product_sales_daily_org_date_product_variant_key
  unique nulls not distinct (organization_id, date, product_id, variant_id);

create index if not exists inventory_variant_idx           on public.inventory (variant_id);
create index if not exists product_sales_daily_variant_idx on public.product_sales_daily (variant_id);

-- The movement trigger keyed inventory on (organization_id, product_id); it now
-- has to find or create the row for the specific variant being moved.
alter table public.inventory_movements
  add column if not exists variant_id uuid references public.product_variants(id) on delete cascade;

create or replace function public.apply_inventory_movement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.inventory (organization_id, product_id, variant_id, on_hand)
  values (new.organization_id, new.product_id, new.variant_id, 0)
  on conflict (organization_id, product_id, variant_id) do nothing;

  update public.inventory
     set on_hand = on_hand + new.quantity,
         last_restocked_at = case when new.type in ('purchase','restock') and new.quantity > 0 then current_date else last_restocked_at end,
         last_counted_at   = case when new.type = 'count' then current_date else last_counted_at end,
         updated_at = now()
   where organization_id = new.organization_id
     and product_id = new.product_id
     and variant_id is not distinct from new.variant_id;

  -- Product status follows the product's total stock across its variants.
  update public.products p
     set status = case
           when p.status in ('draft','discontinued') then p.status
           when tot.on_hand <= 0 then 'out_of_stock'
           when tot.on_hand <= coalesce(tot.reorder_point, 0) then 'low_stock'
           else 'active' end
    from (select product_id, sum(on_hand) as on_hand, max(reorder_point) as reorder_point
            from public.inventory where product_id = new.product_id group by product_id) tot
   where p.id = tot.product_id;
  return new;
end $$;

comment on column public.inventory.variant_id is
  'NULL for products sold without variants; otherwise the specific variant holding this stock.';
