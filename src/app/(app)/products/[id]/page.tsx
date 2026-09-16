import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getProductDetail, getProductOptions } from '@/lib/data/products';
import { PRODUCT_TIER, PRODUCT_STATUS } from '@/lib/products/constants';
import { ProductDrawer } from '@/components/products/ProductDrawer';
import { VariantDrawer } from '@/components/products/VariantDrawer';
import { ProductActions } from '@/components/products/ProductActions';
import { ProductVariants } from '@/components/products/ProductVariants';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STOCK_TONE = { critical: 'pill-bad', low: 'pill-warn', dead: 'pill-warn', ok: 'pill-ok', overstock: 'pill-neutral' } as const;

export default async function ProductDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
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

  const product = await getProductDetail(m.organization_id, id, role, locale);
  if (!product) notFound();

  const canManage = role === 'founder' || role === 'manager';
  const editOpen = first(sp.edit) === '1' && product.canEdit;
  const newVariantOpen = first(sp.newVariant) === '1' && canManage;
  const editVariantId = canManage ? first(sp.editVariant) : undefined;
  const editingVariant = editVariantId ? product.variants.find(v => v.id === editVariantId) : undefined;

  const tierLabels = Object.fromEntries(PRODUCT_TIER.map(t2 => [t2, t(`products.tier_.${t2}`)])) as Record<(typeof PRODUCT_TIER)[number], string>;
  const statusLabels = Object.fromEntries(PRODUCT_STATUS.map(s => [s, t(`common.status.${s}`)])) as Record<(typeof PRODUCT_STATUS)[number], string>;
  const stockLabels = { critical: t('common.stock.critical'), low: t('common.stock.low'), ok: t('common.stock.ok'), overstock: t('common.stock.overstock'), dead: t('common.stock.dead') };

  const options = canManage ? await getProductOptions(m.organization_id) : { suppliers: [] };

  const variantsLabels = {
    variants: t('products.variants'), newVariant: t('products.newVariant'), variantsEmpty: t('products.variantsEmpty'),
    onHand: t('products.onHand'), margin: t('products.margin'), noCost: t('products.noCost'), noMargin: t('products.noMargin'), noStock: t('products.noStock'),
    edit: t('common.edit'), deleteVariant: t('products.deleteVariant'), deleteVariantConfirm: t('products.deleteVariantConfirm'),
    stockCount: t('products.stockCount'), stockCountLabel: t('products.stockCountLabel'), updateStock: t('products.updateStock'), saveFailed: t('products.saveFailed'),
    stockLabels,
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <Link href="/products" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />{t('products.backToProducts')}</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {product.isHero && <Star className="h-4 w-4 shrink-0 text-warn" />}
            <h1 className="truncate">{product.name}</h1>
            <span className="pill pill-neutral">{tierLabels[product.tier]}</span>
            <span className="pill pill-neutral">{statusLabels[product.status]}</span>
            {product.stock && <span className={`pill ${STOCK_TONE[product.stock]}`}>{stockLabels[product.stock]}</span>}
          </div>
          <p className="mt-1 text-xs text-ink-3">{product.sku}</p>
        </div>
        <ProductActions productId={product.id} canEdit={product.canEdit} canDelete={product.canDelete}
          labels={{ edit: t('common.edit'), delete: t('products.delete'), deleteConfirm: t('products.deleteConfirm'), deleteFailed: t('products.deleteFailed') }} />
      </header>

      <div className="card card-pad space-y-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t('products.price')} value={product.price.toLocaleString('en-US')} />
          <Stat label={t('products.cost')} value={product.cost !== null ? product.cost.toLocaleString('en-US') : t('products.noCost')} />
          <Stat label={t('products.margin')} value={product.marginPct !== null ? `${Math.round(product.marginPct)}%` : t('products.noMargin')} />
          <Stat label={t('products.supplier')} value={product.supplier?.name || t('products.noSupplier')} />
          <Stat label={t('products.category')} value={product.category || t('products.noCategory')} />
          <Stat label={t('products.collection')} value={product.collection || '—'} />
          <Stat label={t('products.material')} value={product.material || '—'} />
          <Stat label={t('products.launchDate')} value={product.launchDate ?? '—'} />
        </dl>
        {product.notes && (
          <div className="border-t border-border pt-4">
            <div className="label mb-1">{t('products.notes')}</div>
            <p className="whitespace-pre-line text-sm text-ink-2">{product.notes}</p>
          </div>
        )}
      </div>

      <ProductVariants productId={product.id} variants={product.variants} ownStock={product.ownStock} canManage={canManage} labels={variantsLabels} />

      {editOpen && (
        <ProductDrawer options={options} onCloseHref={`/products/${product.id}`}
          product={{
            id: product.id, name: product.name, sku: product.sku, category: product.category ?? '', collection: product.collection ?? '',
            tier: product.tier, status: product.status, price: String(product.price), cost: product.cost !== null ? String(product.cost) : '',
            supplierId: product.supplier?.id ?? '', isHero: product.isHero,
            weightG: product.weightG !== null ? String(product.weightG) : '', material: product.material ?? '', specification: product.specification ?? '',
            color: product.color ?? '', size: product.size ?? '', launchDate: product.launchDate ?? '', imageUrl: product.imageUrl ?? '', notes: product.notes ?? '',
          }}
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

      {(newVariantOpen || editingVariant) && (
        <VariantDrawer productId={product.id} onCloseHref={`/products/${product.id}`}
          variant={editingVariant && {
            id: editingVariant.id, name: editingVariant.name, sku: editingVariant.sku,
            price: editingVariant.price !== null ? String(editingVariant.price) : '', cost: editingVariant.cost !== null ? String(editingVariant.cost) : '',
            attributes: editingVariant.attributes,
          }}
          labels={{
            newVariant: t('products.newVariant'), editVariant: t('products.editVariant'),
            variantName: t('products.variantName'), sku: t('products.sku'), price: t('products.price'), cost: t('products.cost'), attributes: t('products.attributes'),
            save: t('products.save'), saving: t('products.saving'), cancel: t('products.cancel'), create: t('products.create'),
            close: t('common.close'), saveFailed: t('products.saveFailed'),
          }} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
