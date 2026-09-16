/**
 * Finance (spec §12) — "Are we making money, where is cash?" Founder-only: both
 * `financial_monthly` and `expenses` RLS (`financial_monthly_all`/`expenses_all`
 * in migration 0002) are `is_founder(organization_id)` for every operation
 * including select — no manager/member row at all, unlike most of this app's
 * generic per-table loop. `can.viewFinance` in lib/permissions.ts already existed
 * from an earlier session (unused until now) and already matches this exactly,
 * so unlike Reviews/Marketing/CRM this screen needed no new permission — the app
 * gate and the RLS agree without any deliberate tightening.
 */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };
