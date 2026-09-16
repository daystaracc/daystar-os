-- =====================================================================
-- DAYSTAR OS — customer identity without storing a phone number  (0008)
--
-- Populating `customers` from Showmore's order history was deliberately blocked
-- all session on one decision: how to tell repeat customers apart without ever
-- storing a real phone number in the database (16.2% of customers place 2+
-- orders and drive 31.4% of orders, per docs/ARCHITECTURE.md's "Open decisions").
-- Lucas approved a standard salted hash on 2026-09-14.
--
-- `customers.phone` (0001_schema.sql) is left in place but is never written by
-- the import — it stays available for someone to type a real number in by hand
-- later if that's ever wanted, but the import path only ever writes a hash.
-- `phone_hash` is the actual matching key: same phone number always produces the
-- same HMAC-SHA256 hash (keyed by a server-only secret, `CUSTOMER_PHONE_HASH_SALT`
-- — never stored in this database, checked in
-- app/(app)/revenue/import/actions.ts), so re-importing the same order file
-- upserts the same customer row instead of creating a duplicate, without the
-- hash itself being reversible to the original number.
--
-- Re-runnable: every statement is guarded.
-- =====================================================================

alter table public.customers
  add column if not exists phone_hash text;

-- Partial unique index: only orders with a usable phone number produce a hash: an
-- order with no phone (or one that doesn't normalize to a real number) is simply
-- excluded from customer aggregation (see lib/import/customerAggregation.ts), so
-- multiple such rows must not collide with each other on NULL.
create unique index if not exists customers_org_phone_hash_key
  on public.customers (organization_id, phone_hash)
  where phone_hash is not null;

comment on column public.customers.phone_hash is
  'HMAC-SHA256 of the normalized phone number, keyed by CUSTOMER_PHONE_HASH_SALT (server-only env var, never stored here). The real phone number is never written to this column or anywhere else in the database — see lib/import/customerAggregation.ts.';
comment on column public.customers.phone is
  'Not written by the order import (which only ever produces phone_hash) — reserved for a real number entered by hand, if ever wanted.';
