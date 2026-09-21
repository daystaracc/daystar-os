-- =====================================================================
-- DAYSTAR OS — let application code write to activity_logs directly (0011)
--
-- Found while building the Showmore order sync (2026-09-21): `activity_logs`
-- has a select policy (manager-or-above) but NO insert policy at all. Every
-- row in it today comes from `log_activity()` (migration 0001), a trigger
-- function that writes on changes to tasks/projects/sales_daily/etc. — it
-- works without a policy because a trigger function's writes aren't gated
-- the same way a direct client insert is.
--
-- The order-sync's "N order items couldn't be matched to a product" log
-- (lib/integrations/showmoreSyncWrite.ts) is a direct application insert —
-- there's no table write to hang a trigger off, the fact itself IS the
-- event. Without this policy, that insert silently fails under RLS whenever
-- it runs on a normal user-session client (the manual backfill action);
-- it already works from the webhook route today only because that route
-- uses the service-role client, which bypasses RLS entirely — an
-- inconsistency worth closing rather than leaving as a webhook-only quirk.
--
-- Insert only, manager-or-above — same bar the trigger's own writes
-- represent. No update/delete: an audit log entry should not be editable
-- once written.
-- =====================================================================

create policy activity_logs_write on public.activity_logs
  for insert to authenticated
  with check (public.is_manager_or_above(organization_id));
