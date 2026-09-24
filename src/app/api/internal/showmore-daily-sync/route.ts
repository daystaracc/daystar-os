import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Json } from '@/types/database';

/**
 * Ingestion endpoint for the scheduled Showmore revenue sync. Showmore's real Open
 * API (webhook + `fetchOrder`/`fetchOrdersInRange`, see
 * `lib/integrations/showmoreClient.ts`) needs a paid plan upgrade Lucas declined
 * (2026-09-24) — so day-level totals are instead pulled by a scheduled browser job
 * that reads the visible Showmore order list (no login token ever leaves that
 * session) and POSTs the aggregated result here. No line items, no customer PII —
 * just `{ date, orders, gross, refunds }` per day, the same shape `sales_daily`
 * already stores.
 *
 * Deliberately a ROLLING WINDOW, not just "today": the caller re-sends the last
 * several days every run. Each day upserts (`onConflict: organization_id,date,
 * channel_id`), so re-sending an already-correct day is a no-op — which is what
 * makes this self-healing. If a run is missed entirely (computer off at 5pm), the
 * next successful run's window naturally re-covers the gap; nothing needs a manual
 * backfill.
 *
 * Auth: a shared secret header, not a user session — the caller is an automated
 * job, not a person. `SHOWMORE_SYNC_SECRET` is a secret Claude generated for this
 * integration alone; never expose it client-side.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get('x-sync-secret');
  if (!secret || secret !== process.env.SHOWMORE_SYNC_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { days?: { date: string; orders: number; gross: number; refunds?: number }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const days = body.days ?? [];
  if (!Array.isArray(days) || days.length === 0) {
    return NextResponse.json({ error: 'no days provided' }, { status: 400 });
  }
  for (const d of days) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date) || typeof d.orders !== 'number' || typeof d.gross !== 'number') {
      return NextResponse.json({ error: `invalid day entry: ${JSON.stringify(d)}` }, { status: 400 });
    }
  }
  const sortedDays = [...days].sort((a, b) => a.date.localeCompare(b.date));
  const dateRange = sortedDays.length === 1 ? sortedDays[0].date : `${sortedDays[0].date} – ${sortedDays[sortedDays.length - 1].date}`;
  const ordersTotal = sortedDays.reduce((a, d) => a + d.orders, 0);
  const grossTotal = sortedDays.reduce((a, d) => a + d.gross, 0);

  const sb = createAdminClient();

  // Single-tenant assumption: same as the webhook route — DAYSTAR OS has exactly
  // one organization today, so this resolves it directly rather than from a
  // logged-in membership (there isn't one; this is a machine caller).
  const { data: org, error: orgErr } = await sb.from('organizations').select('id').limit(1).single();
  if (orgErr || !org) {
    return NextResponse.json({ error: 'no organization configured' }, { status: 500 });
  }

  const { data: channel, error: chErr } = await sb
    .from('sales_channels').select('id').eq('organization_id', org.id).eq('key', 'website').single();
  if (chErr || !channel) {
    return NextResponse.json({ error: 'no "website" sales channel configured' }, { status: 500 });
  }

  const rows = sortedDays.map(d => ({
    organization_id: org.id, date: d.date, channel_id: channel.id,
    orders: d.orders, gross_revenue: d.gross, refunds: d.refunds ?? 0,
    created_by: null,
  }));
  const { error: writeErr } = await sb.from('sales_daily').upsert(rows, { onConflict: 'organization_id,date,channel_id' });

  // Logged unconditionally (success or failure) — this is what the Revenue page's
  // "last synced" indicator reads, so a failed run needs to show up just as much as
  // a successful one.
  const summary = writeErr
    ? `Showmore scheduled sync FAILED for ${dateRange}: ${writeErr.message}`
    : `Showmore scheduled sync: ${sortedDays.length} day(s) (${dateRange}), ${ordersTotal} order(s), NT$${grossTotal.toLocaleString('en-US')}.`;
  const { error: logErr } = await sb.from('activity_logs').insert({
    organization_id: org.id,
    actor_id: null,
    action: 'synced',
    entity_type: 'showmore_scheduled_sync',
    entity_id: null,
    summary,
    diff: { ok: !writeErr, days: sortedDays, dateRange, ordersTotal, grossTotal } as unknown as Json,
  });
  if (logErr) console.error('showmore-daily-sync: failed to log run', logErr.message);

  if (writeErr) return NextResponse.json({ error: writeErr.message }, { status: 500 });
  return NextResponse.json({ ok: true, daysWritten: sortedDays.length, ordersTotal, grossTotal });
}
