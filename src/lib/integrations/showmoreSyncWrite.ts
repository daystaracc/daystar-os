import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/types/database';
import { syncOrders, type ShowmoreApiOrder, type CatalogueEntry, type OrderSyncResult } from './showmoreOrders';

/**
 * The DB-facing half of the Showmore order sync: load this org's catalogue, run the
 * pure `syncOrders` logic, then write the result into `sales_daily` (channel
 * `website` — Showmore IS the storefront, see showmoreOrders.ts) and
 * `product_sales_daily`, with unmatched items logged to `activity_logs` rather than
 * dropped. Shared by both the webhook route (service-role client, no user) and the
 * manual backfill action (user-session client, manager/founder) — both hand it a
 * Supabase client and get the same behavior, so a day looks the same regardless of
 * which path touched it.
 *
 * Each date REPLACES whatever `sales_daily`/`product_sales_daily` rows are already
 * there for it — same "save replaces the day's numbers" idiom the CSV revenue
 * import and Operations daily log both already use. Re-running this for the same
 * range is a no-op if nothing changed on Showmore's side.
 */

type Client = SupabaseClient<Database>;

export interface SyncWriteOutcome {
  ok: boolean;
  message?: string;
  summary?: OrderSyncResult['totals'] & { daysWritten: number; productsWritten: number; unmatched: number };
}

async function loadCatalogue(sb: Client, orgId: string): Promise<CatalogueEntry[]> {
  const { data: products, error: pErr } = await sb
    .from('products').select('id, name').eq('organization_id', orgId);
  if (pErr) throw new Error(`loading products: ${pErr.message}`);
  if (!products?.length) return [];

  const nameById = new Map(products.map(p => [p.id, p.name]));
  const { data: variants, error: vErr } = await sb
    .from('product_variants').select('id, product_id, name, showmore_sku')
    .in('product_id', products.map(p => p.id));
  if (vErr) throw new Error(`loading product_variants: ${vErr.message}`);

  return (variants ?? [])
    .filter(v => nameById.has(v.product_id))
    .map(v => ({
      productId: v.product_id,
      variantId: v.id,
      showmoreSku: v.showmore_sku,
      productName: nameById.get(v.product_id)!,
      variantName: v.name,
    }));
}

/**
 * Runs the sync and writes it. `actorId` is the profile to credit `sales_daily
 * .created_by` with — null for the webhook (no signed-in user), the triggering
 * user's id for the manual backfill action.
 */
export async function runShowmoreOrderSync(sb: Client, orgId: string, orders: ShowmoreApiOrder[], actorId: string | null): Promise<SyncWriteOutcome> {
  if (!orders.length) return { ok: true, summary: { ordersIncluded: 0, ordersExcluded: 0, gross: 0, refunds: 0, daysWritten: 0, productsWritten: 0, unmatched: 0 } };

  const [catalogue, { data: channel, error: chErr }] = await Promise.all([
    loadCatalogue(sb, orgId),
    sb.from('sales_channels').select('id').eq('organization_id', orgId).eq('key', 'website').single(),
  ]);
  if (chErr || !channel) return { ok: false, message: 'No "website" sales channel configured for this organization.' };

  const result = syncOrders(orders, catalogue);

  if (result.days.length) {
    const rows = result.days.map(d => ({
      organization_id: orgId, date: d.date, channel_id: channel.id,
      orders: d.orders, gross_revenue: d.gross, refunds: d.refunds,
      created_by: actorId,
    }));
    const { error } = await sb.from('sales_daily').upsert(rows, { onConflict: 'organization_id,date,channel_id' });
    if (error) return { ok: false, message: `sales_daily: ${error.message}` };
  }

  if (result.products.length) {
    const rows = result.products.map(p => ({
      organization_id: orgId, date: p.date, product_id: p.productId, variant_id: p.variantId,
      units: p.units, revenue: p.revenue,
    }));
    // unique nulls not distinct (organization_id, date, product_id, variant_id) — see migration 0001.
    const { error } = await sb.from('product_sales_daily').upsert(rows, { onConflict: 'organization_id,date,product_id,variant_id' });
    if (error) return { ok: false, message: `product_sales_daily: ${error.message}` };
  }

  if (result.unmatched.length) {
    const dates = [...new Set(result.unmatched.map(u => u.date))].sort();
    const { error } = await sb.from('activity_logs').insert({
      organization_id: orgId,
      actor_id: actorId,
      action: 'synced',
      entity_type: 'showmore_order_sync',
      entity_id: null,
      summary: `Showmore sync: ${result.unmatched.length} order item(s) could not be matched to a product (${dates.join(', ')}) — revenue totals are still correct, only per-product attribution is affected.`,
      // UnmatchedItem is an interface (no implicit index signature), so it doesn't
      // structurally satisfy Json even though every field is a plain string/number/null.
      diff: { unmatched: result.unmatched } as unknown as Json,
    });
    // Logging failure shouldn't fail the sync itself — the revenue/product writes above already succeeded.
    if (error) console.error('showmore sync: failed to log unmatched items', error.message);
  }

  return {
    ok: true,
    summary: { ...result.totals, daysWritten: result.days.length, productsWritten: result.products.length, unmatched: result.unmatched.length },
  };
}
