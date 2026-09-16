import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Package, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getProductsPage } from '@/lib/data/products';
import { PRODUCT_TIER, PRODUCT_STATUS } from '@/lib/products/constants';
import { ProductDrawer } from '@/components/products/ProductDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STOCK_TONE = { critical: 'pill-bad', low: 'pill-warn', dead: 'pill-warn', ok: 'pill-ok', overstock: 'pill-neutral' } as const;

/**
 * PRODUCTS (spec §07 Hero Products / catalogue) — "What are we selling, is it in stock?"
 *
 * Read access mirrors `products_select` RLS: every active org member (same generic
 * per-table loop as Projects/Goals). Write is manager-or-above, delete is
 * founder-only. Logging a stock count, on the detail page, is open to any member —
 * see the note in `ProductVariants.tsx`.
 */
export default async function ProductsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');
  const role = m.role as Role;
  const { t, locale } = await getT(profile?.locale);

  const page = await getProductsPage(m.organization_id, role, locale);
  const canManage = role === 'founder' || role === 'manager';
  const drawerOpen = first(sp.new) === '1' && canManage;

  const tierLabels = Object.fromEntries(PRODUCT_TIER.map(t2 => [t2, t(`products.tier_.${t2}`)])) as Record<(typeof PRODUCT_TIER)[number], string>;
  const stockLabels = { critical: t('common.stock.critical'), low: t('common.stock.low'), ok: t('common.stock.ok'), overstock: t('common.stock.overstock'), dead: t('common.stock.dead') };
  const statusLabels = Object.fromEntries(PRODUCT_STATUS.map(s => [s, t(`common.status.${s}`)])) as Record<(typeof PRODUCT_STATUS)[number], string>;

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('products.heading')}</h1>
        {canManage && <Link href="?new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('products.newProduct')}</Link>}
      </header>

      {page.error ? (
        <div className="card card-pad text-sm text-bad">{t('products.loadFailed')}</div>
      ) : !page.products.length ? (
        <div className="card card-pad text-sm text-ink-3">{t('products.empty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {page.products.map(p => (
            <li key={p.id}>
              <Link href={`/products/${p.id}`} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
                {p.isHero ? <Star className="h-4 w-4 shrink-0 text-warn" /> : <Package className="h-4 w-4 shrink-0 text-ink-3" />}
                <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{p.name}</span>
                <span className="hidden w-20 shrink-0 truncate text-xs text-ink-3 md:block">{p.sku}</span>
                <span className="pill pill-neutral w-20 shrink-0 justify-center">{tierLabels[p.tier]}</span>
                <span className={`pill w-24 shrink-0 justify-center ${p.stock ? STOCK_TONE[p.stock] : 'pill-neutral'}`}>{p.stock ? stockLabels[p.stock] : t('products.noStock')}</span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{statusLabels[p.status]}</span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-3">{p.marginPct === null ? t('products.noMargin') : `${Math.round(p.marginPct)}%`}</span>
                <span className="hidden w-16 shrink-0 text-right text-xs tabular-nums text-ink-3 lg:block">{p.onHand}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {drawerOpen && (
        <ProductDrawer options={page.options} onCloseHref="/products"
          labels={{
            newProduct: t('products.newProduct'), editProduct: t('products.editProduct'),
            name: t('products.name'), sku: t('products.sku'), category: t('products.category'), collection: t('products.collection'),
            tier: t('products.tier'), status: t('products.status'), price: t('products.price'), cost: t('products.cost'),
            supplier: t('products.supplier'), hero: t('products.hero'),
            weight: t('products.weight'), material: t('products.material'), specification: t('products.specification'),
            color: t('products.color'), size: t('products.size'), launchDate: t('products.launchDate'), imageUrl: t('products.imageUrl'), notes: t('products.notes'),
            noSupplier: t('products.noSupplier'),
            save: t('products.save'), saving: t('products.saving'), cancel: t('products.cancel'), create: t('products.create'),
            close: t('common.close'), saveFailed: t('products.saveFailed'),
            tierLabels, statusLabels, advanced: t('tasks.advanced'),
          }} />
      )}
    </div>
  );
}
