import { redirect } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { getInventoryOverview } from '@/lib/data/inventory';
import { formatTWD } from '@/lib/calculations/format';
import type { StockStatus } from '@/lib/calculations/inventory';

export const dynamic = 'force-dynamic';

const STOCK_ORDER: StockStatus[] = ['critical', 'low', 'ok', 'overstock', 'dead'];
const STOCK_TONE: Record<StockStatus, string> = { critical: 'pill-bad', low: 'pill-warn', dead: 'pill-warn', ok: 'pill-ok', overstock: 'pill-neutral' };

/**
 * INVENTORY (spec §07/§08 support) — "Are we going to run out, or sitting on dead stock?"
 *
 * Read-only: a dashboard rolled up from `inventory` + `product_sales_daily`, using
 * the tested `stockStatus()` / `reorderSuggestion()` / `inventoryValuation()`
 * calculations. No writes happen here — stock is counted from the Products detail
 * page (`/products/[id]`), open to any active org member (see that screen's notes).
 * `inventory_select` RLS (generic loop): every active org member can read this.
 */
export default async function InventoryPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');
  const { t, locale } = await getT(profile?.locale);

  const overview = await getInventoryOverview(m.organization_id, locale);
  const stockLabels = { critical: t('common.stock.critical'), low: t('common.stock.low'), ok: t('common.stock.ok'), overstock: t('common.stock.overstock'), dead: t('common.stock.dead') };

  if (overview.error) {
    return (
      <div className="space-y-6 animate-fade-up">
        <h1>{t('inventory.heading')}</h1>
        <div className="card card-pad text-sm text-bad">{t('inventory.loadFailed')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-up">
      <h1>{t('inventory.heading')}</h1>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card card-pad space-y-2">
          <div className="label">{t('inventory.valuation')}</div>
          <div className="text-2xl font-semibold tabular-nums">{formatTWD(overview.valuation.value)}</div>
          <p className="text-xs text-ink-3">
            {overview.valuation.complete ? t('inventory.complete') : t('inventory.uncostedWarning', { products: overview.valuation.uncostedProducts, units: overview.valuation.uncostedUnits })}
          </p>
        </div>

        <div className="card card-pad space-y-2">
          <div className="label">{t('inventory.stockBreakdown')}</div>
          <div className="flex flex-wrap gap-2">
            {STOCK_ORDER.map(s => (
              <span key={s} className={`pill ${STOCK_TONE[s]}`}>{stockLabels[s]} · {overview.statusCounts[s]}</span>
            ))}
            {overview.unknownCount > 0 && <span className="pill pill-neutral">{t('inventory.noSalesData')} · {overview.unknownCount}</span>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center gap-2 px-5 py-3">
          <AlertTriangle className="h-4 w-4 text-warn" />
          <span className="label">{t('inventory.reorderNeeded')}</span>
        </div>
        {overview.reorder.length === 0 ? (
          <p className="px-5 pb-4 text-sm text-ink-3">{t('inventory.reorderEmpty')}</p>
        ) : (
          <ul className="divide-y divide-border">
            {overview.reorder.map((r, i) => (
              <li key={`${r.productId}:${r.variantId ?? i}`}>
                <Link href={`/products/${r.productId}`} className="row-hover flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap sm:gap-4">
                  <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">
                    {r.productName}{r.variantName ? ` — ${r.variantName}` : ''}
                  </span>
                  <span className="hidden shrink-0 text-xs text-ink-3 md:block">{r.sku}</span>
                  <span className={`pill ${STOCK_TONE[r.stock]} w-20 shrink-0 justify-center`}>{stockLabels[r.stock]}</span>
                  <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{t('inventory.onHand')}: {r.onHand}</span>
                  <span className="w-24 shrink-0 text-right text-xs font-medium tabular-nums">{t('inventory.suggestedQty')}: {r.suggestedQty}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
