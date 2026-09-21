/**
 * Operations (spec §10-ish, nav item `operations` → `/operations`) — the daily
 * fulfillment/CS log. This screen existed only as a nav entry, an i18n label, and
 * a schema (migration 0001's `operations_daily` + `customer_service_cases`) until
 * 2026-09-21: clicking it 404'd because no route, data layer, or actions were ever
 * built. Both tables are already wired into the Command Center's attention rules
 * (lib/calculations/rules.ts `cs_stale` / `orders_waiting`, both linking here —
 * `cs_stale` to `/operations?tab=cs` specifically), so the tab query param names
 * below (`daily` / `cs`) are not arbitrary — `cs` must match that existing link.
 *
 * `operations_daily_select` / `customer_service_cases_select` RLS (generic loop,
 * migration 0002): any active org member can read — matches the nav item having no
 * `roles` restriction. Insert/update are manager-or-above; delete is founder-only —
 * same shape as Goals/Projects/Campaigns, not the founder-only shape of Finance/CRM.
 */
export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: 'forbidden' | 'invalid' | 'failed' };

export const CS_CHANNEL = ['line', 'instagram', 'email', 'shopee', 'other'] as const;
export type CsChannel = (typeof CS_CHANNEL)[number];

export const CS_ISSUE_TYPE = ['shipping', 'return', 'exchange', 'defect', 'size', 'product_question', 'payment', 'other'] as const;
export type CsIssueType = (typeof CS_ISSUE_TYPE)[number];

export const CS_STATUS = ['open', 'waiting', 'resolved', 'closed'] as const;
export type CsStatus = (typeof CS_STATUS)[number];
