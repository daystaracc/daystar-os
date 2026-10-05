import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { evaluateRules, type RulesSnapshot, type Severity } from '@/lib/calculations/rules';
import { computePacing, monthBounds, shiftDays } from '@/lib/calculations/pacing';
import { getDictionary, makeT, DEFAULT_LOCALE, type Locale } from '@/lib/i18n';
import type { Json } from '@/types/database';

/**
 * Daily notifications fan-out — new 2026-10-01.
 *
 * Populates the `notifications` table (built 2026-09-14, deliberately read-only until
 * now — see the comment on `getNotifications` in `lib/data/notifications.ts`) so the
 * bell icon and `/notifications` finally show something real instead of an empty state.
 *
 * Triggered by Vercel Cron (see `vercel.json` at the repo root), NOT by one of
 * Claude's own scheduled browser tasks. That's deliberate: the Showmore daily sync
 * uses a Claude-scheduled task that drives a real browser, and that has turned out to
 * silently need same-day human approval it often doesn't get (see the 2026-10-01 entry
 * in ARCHITECTURE.md §0) — it can report "succeeded" while doing nothing. A plain
 * server-to-server Vercel Cron hitting this route has no such dependency: it either
 * runs or Vercel's own cron logs show a failure, with nobody's live approval involved.
 *
 * Reuses `evaluateRules()` from `lib/calculations/rules.ts` COMPLETELY UNCHANGED — the
 * exact same business logic that already drives the Overview page's "What needs
 * attention" list — so every rule still has exactly one definition, here and there.
 * What IS new is the input gathering. `getCommandCenter` (`lib/data/commandCenter.ts`)
 * builds a full ~20-query snapshot via the session-scoped `createClient()`, which needs
 * a logged-in user and passes through RLS; this route has neither (it's a machine
 * caller with no session), so it re-gathers a DELIBERATELY NARROWER slice of the same
 * shape here via the service-role admin client (service-role bypasses RLS, same as
 * `showmore-daily-sync`/`showmore` webhook already do).
 *
 * Scope of this v1: revenue pace, hero-product stock, overdue tasks, a content-output
 * stall, an ad-spend stall, and stale CS cases — the rules that were actually firing on
 * the real Overview page as of 2026-10-01 (confirmed live during this session's
 * click-testing sweep). Project health, key results, AOV/CVR-vs-target, reviews-due and
 * the business-systems score are intentionally left out: their snapshot fields below are
 * passed as empty/neutral, so `evaluateRules` simply emits nothing for those categories
 * rather than getting a wrong answer from a half-built input. Extending coverage later
 * should still call the real `evaluateRules` — just add the missing queries here (or,
 * better, factor `getCommandCenter`'s snapshot-building into a client-agnostic helper
 * both places can share, instead of letting this file and that one drift apart).
 *
 * NOT YET RUN AGAINST A REAL TYPESCRIPT COMPILER — this session had no shell access on
 * Lucas's machine to actually run `npm run typecheck`. It's had more than the usual
 * "parses clean by inspection" pass, though: every column this file reads or writes
 * (targets, v_sales_daily_total, tasks, products, inventory, v_product_sales_30d,
 * content, ad_spend_daily, customer_service_cases, memberships, notifications) was
 * individually checked against the real generated types in `src/types/database.ts`
 * after writing this, not assumed from memory — including confirming `notifications.
 * severity` is a plain `string` column in the generated Insert type (not a literal
 * union), so the `Severity`-typed rows below are a strict subset, not a mismatch. Still
 * run `npm run typecheck` before trusting it — this closes the most likely failure mode
 * (a wrong column name or shape) but doesn't replace an actual compile.
 *
 * Auth: Vercel Cron's own built-in mechanism. When a `CRON_SECRET` env var is set on
 * the Vercel project, Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`
 * on every cron-triggered request to this project, and only on those — unlike
 * `SHOWMORE_SYNC_SECRET` (which Claude generated for that integration), Lucas needs to
 * generate this one himself and add it to Vercel, then add the schedule to
 * `vercel.json`. See `.env.example` for the exact steps. To test by hand before the
 * cron fires: `curl -X GET https://daystar-os.vercel.app/api/cron/notifications-fanout
 * -H "Authorization: Bearer <the CRON_SECRET value>"`.
 */
export const dynamic = 'force-dynamic';

const FOUNDER_ROLES = ['founder', 'manager']; // same audience that already sees the Overview attention list (member → redirected to /my-work, never sees it)
const NOTIFY_SEVERITIES = new Set(['critical', 'high']); // medium/low stay off notifications for v1 — Overview already surfaces those; this is for things worth an interruption

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sb = createAdminClient();
  const asOf = new Date().toISOString().slice(0, 10);

  // Single-tenant assumption, same as showmore-daily-sync and the showmore webhook —
  // DAYSTAR OS has exactly one organization today.
  const { data: org, error: orgErr } = await sb.from('organizations').select('id').limit(1).single();
  if (orgErr || !org) return NextResponse.json({ error: 'no organization configured' }, { status: 500 });
  const orgId = org.id as string;

  const m = monthBounds(asOf);

  const [targets, salesM, tasksRes, heroProductsRes, inventoryRes, sales30Res, contentRecentRes, adsRes, csRes, recipientsRes] = await Promise.all([
    sb.from('targets').select('metric, value, period_start, period_end').eq('organization_id', orgId).lte('period_start', asOf).gte('period_end', asOf),
    sb.from('v_sales_daily_total').select('date, gross_revenue').eq('organization_id', orgId).gte('date', m.start).lte('date', m.end),
    sb.from('tasks').select('id, priority, status, due_date').eq('organization_id', orgId).neq('status', 'done'),
    sb.from('products').select('id, name, is_hero, status').eq('organization_id', orgId).eq('is_hero', true).neq('status', 'discontinued'),
    sb.from('inventory').select('product_id, on_hand, reserved, safety_stock, reorder_point').eq('organization_id', orgId),
    sb.from('v_product_sales_30d').select('product_id, units_per_day').eq('organization_id', orgId),
    // 'posted' — content.status collapsed from 8 stages to idea/planned/shot/posted by migration 0012 (2026-10-02); used to read 'published'.
    sb.from('content').select('publish_date').eq('organization_id', orgId).eq('status', 'posted').gte('publish_date', shiftDays(asOf, -6)).lte('publish_date', asOf),
    sb.from('ad_spend_daily').select('date, spend').eq('organization_id', orgId).gte('date', shiftDays(asOf, -34)).lte('date', asOf),
    sb.from('customer_service_cases').select('id, created_at, last_response_at').eq('organization_id', orgId).in('status', ['open', 'waiting']),
    sb.from('memberships').select('profile_id, role, profiles:profile_id(locale)').eq('organization_id', orgId).eq('status', 'active').in('role', FOUNDER_ROLES),
  ]);

  // -- revenue pace --
  const curRevenue = (salesM.data ?? []).reduce((a, r) => a + Number(r.gross_revenue ?? 0), 0);
  const monthlyTarget = Number(targets.data?.find(t => t.metric === 'monthly_revenue')?.value ?? NaN) || 0;
  const pacing = computePacing({ target: monthlyTarget, actual: curRevenue, periodStart: m.start, periodEnd: m.end, asOf });

  // -- hero product stock (mirrors the relevant slice of commandCenter.ts's stockRows) --
  const invBy = new Map((inventoryRes.data ?? []).map(i => [i.product_id as string, i]));
  const velBy = new Map((sales30Res.data ?? []).map(s => [s.product_id as string, Number(s.units_per_day ?? 0)]));
  const heroProducts = (heroProductsRes.data ?? []).map(p => {
    const inv = invBy.get(p.id as string);
    return {
      id: p.id as string, name: p.name as string,
      onHand: Number(inv?.on_hand ?? 0), reserved: Number(inv?.reserved ?? 0),
      unitsPerDay: velBy.get(p.id as string) ?? 0,
      safetyStock: Number(inv?.safety_stock ?? 0), reorderPoint: Number(inv?.reorder_point ?? 0),
      isHero: true,
    };
  });

  // -- tasks overdue --
  const overdue = (tasksRes.data ?? []).filter(t => t.due_date && t.due_date < asOf);

  // -- content output stall (mirrors commandCenter.ts's countPublishedSince over the same windows) --
  const weeklyTarget = Number(targets.data?.find(t => t.metric === 'weekly_content')?.value ?? NaN) || null;
  const publishedRows = contentRecentRes.data ?? [];
  const publishedLast3Days = publishedRows.filter(r => r.publish_date && r.publish_date >= shiftDays(asOf, -2)).length;
  const publishedLast7Days = publishedRows.length; // the query window IS the trailing 7 days

  // -- ad spend stall (duplicated from commandCenter.ts's adSpendStreak — small, pure, kept local rather than touching that file) --
  const ads = adSpendStreak(adsRes.data, asOf);

  // -- CS stale (mirrors commandCenter.ts's operations.csOpenOver24h) --
  const csRows = csRes.data ?? [];
  const csOpenOver24h = csRows.filter(c => Date.parse(c.last_response_at ?? c.created_at) < Date.parse(asOf) - 86_400_000).length;

  const snapshot: RulesSnapshot = {
    asOf, revenue: pacing,
    aov: { current: null, previous: null, target: null },           // out of scope for v1 — see file comment
    cvr: { current: null, target: null },                            // out of scope for v1
    heroProducts,
    incomingLate: [],                                                // out of scope for v1
    projects: [],                                                    // out of scope for v1
    tasks: { overdueUrgent: overdue.filter(t => t.priority === 'urgent').length, overdueHigh: overdue.filter(t => t.priority === 'high').length, blocked: 0 },
    content: { publishedThisWeek: 0, weeklyTarget, weekElapsedFraction: 0, publishedLast3Days, publishedLast7Days }, // weekElapsedFraction:0 deliberately suppresses content_behind (needs real week bounds, out of scope) while still allowing content_output_stopped
    ads,
    ordersPerDay: { last7: null, prev28: null },                     // out of scope for v1
    keyResults: [],                                                  // out of scope for v1
    reviews: { weeklyDue: null, weeklyDone: true },                  // out of scope for v1 (weeklyDone:true keeps review_overdue/review_due from firing on incomplete data)
    operations: { ordersWaiting: 0, csOpenOver24h, csPending: csRows.length },
    systems: [],                                                     // out of scope for v1
    dismissals: [],                                                  // attention_dismissals aren't threaded through here yet — a dismissed item on Overview can still generate a notification until this is added
  };

  const allItems = evaluateRules(snapshot).filter(i => NOTIFY_SEVERITIES.has(i.severity));

  const recipients = (recipientsRes.data ?? [])
    .map(r => ({ id: r.profile_id as string, locale: localeOf(r.profiles) }));

  if (recipients.length === 0 || allItems.length === 0) {
    return NextResponse.json({ ok: true, itemsEvaluated: allItems.length, recipients: recipients.length, written: 0 });
  }

  // Dedup: skip (recipient, type, entity) combinations that already have an unread
  // notification sitting there — don't re-notify about an unresolved issue every day,
  // only once it's been read (or resolved, which removes it from `allItems` entirely
  // the next time this runs).
  const { data: existing } = await sb
    .from('notifications')
    .select('recipient_id, type, entity_id')
    .eq('organization_id', orgId)
    .is('read_at', null)
    .in('recipient_id', recipients.map(r => r.id));
  const existingKeys = new Set((existing ?? []).map(n => dedupKey(n.recipient_id as string, n.type as string, n.entity_id as string | null)));

  // Build each recipient's own translator once (not per item) — dictionaries are
  // static imports, cheap to load, but no reason to redo it per attention item.
  const translators = new Map<string, { t: ReturnType<typeof makeT> }>();
  for (const r of recipients) {
    if (!translators.has(r.locale)) translators.set(r.locale, { t: makeT(await getDictionary(r.locale)) });
  }

  const rows: { organization_id: string; recipient_id: string; type: string; severity: Severity; title: string; body: string; entity_type: string | null; entity_id: string | null }[] = [];
  for (const recipient of recipients) {
    const { t } = translators.get(recipient.locale)!;
    for (const item of allItems) {
      const key = dedupKey(recipient.id, item.code, item.entityId ?? null);
      if (existingKeys.has(key)) continue;
      const title = t(`attention.${item.code}` as never, item.params);
      const body = `${t('common.view')}: ${item.href}`;
      rows.push({
        organization_id: orgId, recipient_id: recipient.id, type: item.code, severity: item.severity,
        title, body, entity_type: item.entityType ?? null, entity_id: item.entityId ?? null,
      });
    }
  }

  let writeErr: string | null = null;
  if (rows.length > 0) {
    const { error } = await sb.from('notifications').insert(rows);
    if (error) writeErr = error.message;
  }

  // Logged unconditionally, same convention as showmore-daily-sync — this is what a
  // future "last fan-out run" indicator would read, if one gets added to Settings.
  const summary = writeErr
    ? `Notifications fan-out FAILED: ${writeErr}`
    : `Notifications fan-out: ${allItems.length} attention item(s), ${recipients.length} recipient(s), ${rows.length} notification(s) written (${allItems.length * recipients.length - rows.length} already pending/skipped).`;
  await sb.from('activity_logs').insert({
    organization_id: orgId, actor_id: null, action: 'synced', entity_type: 'notifications_fanout', entity_id: null,
    summary, diff: { ok: !writeErr, itemsEvaluated: allItems.length, recipients: recipients.length, written: rows.length } as unknown as Json,
  });

  if (writeErr) return NextResponse.json({ error: writeErr }, { status: 500 });
  return NextResponse.json({ ok: true, itemsEvaluated: allItems.length, recipients: recipients.length, written: rows.length });
}

function dedupKey(recipientId: string, type: string, entityId: string | null): string {
  return `${recipientId}|${type}|${entityId ?? ''}`;
}

/**
 * Same defensive shape-handling as commandCenter.ts's local `nameOf()` — a Supabase
 * embedded-FK select (`profiles:profile_id(locale)`) can come back as either a single
 * object or a one-element array depending on how the relationship is inferred, and the
 * generated types don't reliably disambiguate it either. Falls back to the app default
 * (zh-Hant) when a recipient has never set one.
 */
function localeOf(p: unknown): Locale {
  const x = Array.isArray(p) ? p[0] : p;
  const v = (x as { locale?: string } | null)?.locale;
  return v === 'en' || v === 'zh-Hant' ? v : DEFAULT_LOCALE;
}

/**
 * Duplicated from commandCenter.ts's identically-named local function (not exported
 * there) rather than exporting it from a live, already-verified file for one new
 * caller. Keep in sync if that one changes.
 *
 * How many consecutive days up to `asOf` have no spend, and what the 14 days before
 * that streak averaged. A missing row counts as zero.
 */
function adSpendStreak(rows: { date: string | null; spend: number | null }[] | null, asOf: string): { zeroOrMissingDays: number; prior14DayAverage: number } {
  const byDay = new Map<string, number>();
  for (const r of rows ?? []) if (r.date) byDay.set(r.date, (byDay.get(r.date) ?? 0) + Number(r.spend ?? 0));

  let zeroOrMissingDays = 0;
  while (zeroOrMissingDays < 35 && (byDay.get(shiftDays(asOf, -zeroOrMissingDays)) ?? 0) <= 0) zeroOrMissingDays += 1;

  let total = 0;
  for (let i = 0; i < 14; i += 1) total += byDay.get(shiftDays(asOf, -(zeroOrMissingDays + i))) ?? 0;
  return { zeroOrMissingDays, prior14DayAverage: total / 14 };
}
