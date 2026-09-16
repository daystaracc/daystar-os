-- =====================================================================
-- DAYSTAR OS — fix the customers upsert's ON CONFLICT target  (0009)
--
-- 0008_customer_phone_hash.sql created a *partial* unique index
-- (`where phone_hash is not null`), reasoning that rows with no phone
-- shouldn't collide with each other. That reasoning was unnecessary —
-- in standard SQL, a plain unique index already treats every NULL as
-- distinct from every other NULL, so an ordinary (non-partial) unique
-- index behaves identically for that case.
--
-- It also broke the real import. Supabase's
-- `.upsert(rows, { onConflict: 'organization_id,phone_hash' })` compiles to
-- a plain `ON CONFLICT (organization_id, phone_hash) DO UPDATE ...` with no
-- WHERE clause, and Postgres will only match an ON CONFLICT target against
-- a partial index if the same predicate is repeated in the conflict
-- clause — which the Supabase JS client has no option to express. Real
-- error hit running the first live customer import, 2026-09-15:
--   "customers: there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
-- The revenue side of that same import (`sales_daily`) succeeded — this
-- only ever blocked the customers write.
--
-- Fix: drop the partial index, replace it with a plain one on the same
-- columns. extractCustomerOrders/aggregateCustomers
-- (lib/import/customerAggregation.ts) never produce a row with
-- phone_hash null in the first place — only orders with a usable phone
-- are aggregated into a customer at all — so this loses no protection.
--
-- Re-runnable: both statements are guarded.
-- =====================================================================

drop index if exists public.customers_org_phone_hash_key;

create unique index if not exists customers_org_phone_hash_key
  on public.customers (organization_id, phone_hash);
