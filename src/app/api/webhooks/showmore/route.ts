import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyWebhookSignature, fetchOrder, fetchOrdersInRange } from '@/lib/integrations/showmoreClient';
import { runShowmoreOrderSync } from '@/lib/integrations/showmoreSyncWrite';

/**
 * Showmore's shipping webhook (`/your_shipping_webhook` in their spec — this app's
 * end is whatever URL is registered on THEIR side, in Showmore's 串接文件 settings;
 * it does not need to match their path name). Fires on order created/canceled/
 * edited/returned/reviewing/reviewing_reject. No user session — an external
 * caller, authenticated only by the HMAC signature — so this uses the service-role
 * client (`createAdminClient`, bypasses RLS entirely) and resolves the
 * organization itself rather than from a logged-in membership.
 *
 * Single-tenant assumption: this app has exactly one organization today, same
 * assumption the rest of the app's external-integration config already makes
 * (SHOWMORE_API_KEY is one global env var, not stored per-org). If DAYSTAR OS
 * ever serves more than one org, this needs a real merchant_id → organization_id
 * lookup (the webhook payload's `merchant_id` is already there for that) —
 * flagged here rather than silently assumed away.
 *
 * On any event, the whole day containing the order is refetched and resynced —
 * not just that one order — so other orders placed the same day stay correctly
 * summed, and an edit that could move an order's totals doesn't leave the old
 * numbers stale. Responding anything other than plain-text "OK" makes Showmore
 * retry automatically (every 5–30 min, up to 4 times) — so a thrown error here
 * is a free retry, not a dropped event; letting it propagate is deliberate.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text();

  if (!verifyWebhookSignature(rawBody, req.headers.get('x-hub-signature-256'))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let payload: { order_number?: string; event?: string; merchant_id?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }
  const orderNumber = payload.order_number;
  if (!orderNumber) return new NextResponse('OK'); // nothing to resync — respond OK so this specific malformed event isn't retried forever

  const sb = createAdminClient();
  const { data: org, error: orgErr } = await sb.from('organizations').select('id').limit(1).single();
  if (orgErr || !org) {
    console.error('showmore webhook: no organization found', orgErr?.message);
    return NextResponse.json({ error: 'no organization configured' }, { status: 500 });
  }

  const order = await fetchOrder(orderNumber);
  if (!order) {
    // Order not found — could be a timing race with Showmore's own systems. Not
    // worth a retry storm; log and move on.
    console.warn(`showmore webhook: order ${orderNumber} (event ${payload.event}) not found via GET /api/v1/order`);
    return new NextResponse('OK');
  }

  const date = order.createdAt.slice(0, 10);
  const dayOrders = await fetchOrdersInRange(`${date}T00:00:00+08:00`, `${date}T23:59:59+08:00`);

  const outcome = await runShowmoreOrderSync(sb, org.id, dayOrders, null);
  if (!outcome.ok) {
    console.error(`showmore webhook: sync failed for ${date}`, outcome.message);
    return NextResponse.json({ error: outcome.message }, { status: 500 });
  }

  return new NextResponse('OK');
}
