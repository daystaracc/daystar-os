import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { stockStatus, reorderSuggestion, type StockStatus } from '@/lib/calculations/inventory';
import { localizedField, DEFAULT_LOCALE, type Locale } from '@/lib/i18n';
import type { Json } from '@/types/database';

/**
 * Daily auto-reorder task creation — new 2026-10-02.
 *
 * First slice of the automation engine Lucas asked for: Inventory's reorder list
 * (`getInventoryOverview()` in `lib/data/inventory.ts`) already computes exactly which
 * products/variants are `critical` or `low` and how much to reorder, via the tested
 * `stockStatus()` / `reorderSuggestion()` in `lib/calculations/inventory.ts` — but until
 * now nothing *acted* on that list except a human looking at the Inventory page. This
 * route turns each critical/low row into a real `tasks` row, so reordering shows up on
 * someone's task list instead of depending on someone remembering to check.
 *
 * Deliberately a SEPARATE route from `notifications-fanout`, not an extension of it:
 * that route evaluates `evaluateRules()` and writes to `notifications` (a read model);
 * this route writes to `tasks` (a work-assignment system with its own RLS and UI). Same
 * trigger mechanism (Vercel Cron, Bearer `CRON_SECRET`), same admin-client/single-org
 * pattern, but a different shared resource and a different failure mode, so keeping them
 * separate means one can fail or get disabled without the other being touched.
 *
 * Mirrors `getInventoryOverview()`'s query shape exactly (same columns, same
 * `VELOCITY_WINDOW_DAYS`), but re-implemented here against the service-role admin
 * client: `getInventoryOverview()` uses the request-scoped `createClient()` from
 * `lib/supabase/server`, which needs a logged-in user's cookies and doesn't exist in a
 * cron request. Same reasoning as `notifications-fanout`'s file comment for why that
 * route re-gathers its own snapshot instead of calling the session-scoped data fetcher.
 *
 * Dedup: `tasks` has no `product_id`/`variant_id` column (projects/goals/departments
 * only), so identity is carried in `description` as a trailing
 * `[auto-reorder-key: <productId>:<variantId ?? ''>]` marker line, and every row this
 * route creates also gets the `auto-reorder` label (visible/filterable in the Tasks UI,
 * which derives its label list from `tasks.labels` directly — see `getTasksPage` in
 * `lib/data/tasks.ts` — no `task_labels` registry entry needed for it to show up).
 * Before inserting, this route fetches every open (`status != 'done'`) task already
 * carrying the `auto-reorder` label and skips any product/variant that already has one
 * — so a product stuck at `critical` for a week gets exactly one task, not seven. If
 * stock later recovers, the existing task is NOT auto-closed: resolving it is a human
 * decision (did we actually reorder, or did the sales velocity just stall?), so it's
 * left for whoever's doing the work to mark done.
 *
 * owner_id / assignee_id are left `null` (unassigned) and `created_by` is left `null`
 * (no human actor exists in a cron context — same convention `notifications-fanout`
 * uses for `activity_logs.actor_id`). There's no established "inventory owner" role in
 * this codebase to default to, and guessing wrong would be worse than leaving it
 * unassigned for a founder/manager to triage. Revisit if Lucas wants a specific default
 * assignee.
 *
 * due_date: today for `critical` rows (reorder now), +3 days for `low` rows (still
 * urgent, slightly more slack). priority: `urgent` for critical, `high` for low —
 * matching the same critical/low → urgent/high mapping notifications-fanout already
 * uses for its `NOTIFY_SEVERITIES` filter, so the two systems agree on what "urgent"
 * means for stock.
 *
 * NOT YET RUN AGAINST A REAL TYPESCRIPT COMPILER — same caveat as notifications-fanout
 * when it shipped: written carefully against the real generated types in
 * `src/types/database.ts` (tasks, inventory, product_sales_daily, products,
 * product_variants, organizations columns individually checked), but this session has
 * no shell on Lucas's machine to run `npm run typecheck` itself. Run it before trusting
 * this compiles, and before `git push`.
 *
 * Auth: identical to notifications-fanout — Vercel Cron's `Authorization: Bearer
 * <CRON_SECRET>`, same env var already set up in Vercel from that route. To test by
 * hand: `curl https://daystar-os.vercel.app/api/cron/auto-reorder-tasks -H
 * "Authorization: Bearer <the CRON_SECRET value>"`.
 */
export const dynamic = 'force-dynamic';

const VELOCITY_WINDOW_DAYS = 30;
const AUTO_REORDER_LABEL = 'auto-reorder';

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = createAdminClient();
  const asOf = new Date().toISOString().slice(0, 10);
  const dueDatePlus = (days: number) => {
    const d = new Date(asOf);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // Single-tenant assumption, same as notifications-fanout and showmore-daily-sync.
  const { data: org, error: orgErr } = await sb.from('organizations').select('id, locale').limit(1).single();
  if (orgErr || !org) return NextResponse.json({ error: 'no organization configured' }, { status: 500 });
  const orgId = org.id as string;
  const locale: Locale = org.locale === 'en' || org.locale === 'zh-Hant' ? org.locale : DEFAULT_LOCALE;

  const cutoff = new Date(asOf);
  cutoff.setUTCDate(cutoff.getUTCDate() - VELOCITY_WINDOW_DAYS);

  const [invRes, salesRes, existingRes] = await Promise.all([
    sb.from('inventory').select('product_id, variant_id, on_hand, reserved, incoming, safety_stock, reorder_point, moq, lead_time_days').eq('organization_id', orgId),
    sb.from('product_sales_daily').select('product_id, variant_id, units').eq('organization_id', orgId).gte('date', cutoff.toISOString().slice(0, 10)),
    sb.from('tasks').select('id, description').eq('organization_id', orgId).neq('status', 'done').contains('labels', [AUTO_REORDER_LABEL]),
  ]);
  if (invRes.error) return NextResponse.json({ error: invRes.error.message }, { status: 500 });

  const key = (productId: string, variantId: string | null) => `${productId}:${variantId ?? ''}`;

  const unitsInWindow = new Map<string, number>();
  for (const row of salesRes.data ?? []) {
    const k = key(row.product_id as string, row.variant_id as string | null);
    unitsInWindow.set(k, (unitsInWindow.get(k) ?? 0) + (row.units as number));
  }

  // Already-open auto-reorder tasks, keyed the same way, parsed back out of the
  // marker line left in `description`.
  const openKeys = new Set<string>();
  const KEY_RE = /\[auto-reorder-key: ([^:]+):([^\]]*)\]/;
  for (const t of existingRes.data ?? []) {
    const m = KEY_RE.exec((t.description as string | null) ?? '');
    if (m) openKeys.add(`${m[1]}:${m[2]}`);
  }

  const rows = invRes.data ?? [];
  const productIds = [...new Set(rows.map(r => r.product_id as string))];
  const variantIds = [...new Set(rows.map(r => r.variant_id as string | null).filter((v): v is string => v !== null))];

  const [{ data: products }, { data: variants }] = await Promise.all([
    productIds.length
      ? sb.from('products').select('id, name, name_zh, sku').in('id', productIds)
      : Promise.resolve({ data: [] as { id: string; name: string; name_zh: string | null; sku: string }[] }),
    variantIds.length
      ? sb.from('product_variants').select('id, name, sku').in('id', variantIds)
      : Promise.resolve({ data: [] as { id: string; name: string; sku: string }[] }),
  ]);
  const productById = new Map((products ?? []).map(p => [p.id as string, p]));
  const variantById = new Map((variants ?? []).map(v => [v.id as string, v]));

  type NewTask = { title: string; description: string; priority: 'urgent' | 'high'; due_date: string; labels: string[] };
  const toCreate: NewTask[] = [];
  let evaluated = 0;

  for (const r of rows) {
    const productId = r.product_id as string;
    const variantId = r.variant_id as string | null;
    const k = key(productId, variantId);
    const hasVelocity = unitsInWindow.has(k);
    if (!hasVelocity) continue; // same "no data" exclusion as getInventoryOverview()
    const unitsPerDay = unitsInWindow.get(k)! / VELOCITY_WINDOW_DAYS;

    const status: StockStatus = stockStatus({
      onHand: r.on_hand as number, reserved: r.reserved as number, incoming: r.incoming as number,
      safetyStock: r.safety_stock as number, reorderPoint: r.reorder_point as number, unitsPerDay,
    });
    if (status !== 'critical' && status !== 'low') continue;
    evaluated += 1;
    if (openKeys.has(k)) continue; // already has an open auto-reorder task

    const product = productById.get(productId);
    const variant = variantId ? variantById.get(variantId) : null;
    const productName = product ? localizedField(product, 'name', locale) : productId;
    const variantName = variant?.name ?? null;
    const sku = variant?.sku ?? product?.sku ?? '';
    const suggestedQty = reorderSuggestion({
      onHand: r.on_hand as number, reserved: r.reserved as number, incoming: r.incoming as number, safetyStock: r.safety_stock as number,
      unitsPerDay, leadTimeDays: (r.lead_time_days as number | null) ?? undefined, moq: (r.moq as number | null) ?? undefined,
    });

    const title = `Reorder needed: ${productName}${variantName ? ` — ${variantName}` : ''}`;
    const description = [
      `Stock status: ${status}.`,
      `On hand: ${r.on_hand}${sku ? ` (SKU ${sku})` : ''}.`,
      `Suggested reorder quantity: ${suggestedQty} unit(s).`,
      `Auto-created by the inventory reorder check on ${asOf}.`,
      `[auto-reorder-key: ${productId}:${variantId ?? ''}]`,
    ].join('\n');

    toCreate.push({
      title,
      description,
      priority: status === 'critical' ? 'urgent' : 'high',
      due_date: status === 'critical' ? asOf : dueDatePlus(3),
      labels: [AUTO_REORDER_LABEL],
    });
  }

  if (toCreate.length === 0) {
    return NextResponse.json({ ok: true, evaluated, created: 0 });
  }

  const { error: insertErr } = await sb.from('tasks').insert(
    toCreate.map(t => ({
      organization_id: orgId,
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: 'todo',
      due_date: t.due_date,
      labels: t.labels,
      owner_id: null,
      assignee_id: null,
      created_by: null,
    })),
  );

  const summary = insertErr
    ? `Auto-reorder task creation FAILED: ${insertErr.message}`
    : `Auto-reorder tasks: ${evaluated} critical/low row(s) evaluated, ${toCreate.length} new task(s) created (${evaluated - toCreate.length} already had an open task).`;
  await sb.from('activity_logs').insert({
    organization_id: orgId, actor_id: null, action: 'synced', entity_type: 'auto_reorder_tasks', entity_id: null,
    summary, diff: { ok: !insertErr, evaluated, created: toCreate.length } as unknown as Json,
  });

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, evaluated, created: toCreate.length });
}
