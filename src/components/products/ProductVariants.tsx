'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2, Plus } from 'lucide-react';
import { deleteVariant, recordStockCount } from '@/app/(app)/products/actions';
import type { VariantRow } from '@/lib/data/products';
import type { StockStatus } from '@/lib/calculations/inventory';

const STOCK_TONE: Record<StockStatus, string> = { critical: 'pill-bad', low: 'pill-warn', dead: 'pill-warn', ok: 'pill-ok', overstock: 'pill-neutral' };

export interface ProductVariantsLabels {
  variants: string; newVariant: string; variantsEmpty: string; onHand: string; margin: string; noCost: string; noMargin: string; noStock: string;
  edit: string; deleteVariant: string; deleteVariantConfirm: string; stockCount: string; stockCountLabel: string; updateStock: string; saveFailed: string;
  stockLabels: Record<StockStatus, string>;
}

/**
 * Variant list for a product's detail page (or the product's own stock line, when it
 * has no variants). Read-only rendering plus, for managers/founders, add/edit/delete
 * on variants, and — for ANY active org member, per `inventory_movements_insert`
 * RLS ("fulfillment staff adjust stock") — an inline control to log today's physical
 * count without opening a form.
 */
export function ProductVariants({ productId, variants, ownStock, canManage, labels }: {
  productId: string; variants: VariantRow[]; ownStock: { onHand: number; stock: StockStatus | null } | null; canManage: boolean; labels: ProductVariantsLabels;
}) {
  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-3">
        <span className="label">{labels.variants}</span>
        {canManage && <Link href="?newVariant=1" scroll={false} className="btn-outline h-8 text-xs"><Plus className="h-3.5 w-3.5" />{labels.newVariant}</Link>}
      </div>

      {ownStock ? (
        <div className="px-5 pb-4">
          <StockLine productId={productId} variantId={null} onHand={ownStock.onHand} stock={ownStock.stock} title={null} labels={labels} />
        </div>
      ) : variants.length === 0 ? (
        <p className="px-5 pb-4 text-sm text-ink-3">{labels.variantsEmpty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {variants.map(v => (
            <li key={v.id} className="space-y-2 px-5 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{v.name}</span>
                <span className="shrink-0 text-xs text-ink-3">{v.sku}</span>
                <span className="w-16 shrink-0 text-right text-xs tabular-nums text-ink-3">{v.marginPct === null ? labels.noMargin : `${Math.round(v.marginPct)}%`}</span>
                {canManage && <Link href={`?editVariant=${v.id}`} scroll={false} aria-label={labels.edit} className="btn-ghost h-7 w-7 shrink-0 px-0"><Pencil className="h-3.5 w-3.5" /></Link>}
                {canManage && <DeleteVariantButton productId={productId} variantId={v.id} labels={labels} />}
              </div>
              <StockLine productId={productId} variantId={v.id} onHand={v.onHand} stock={v.stock} title={null} labels={labels} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StockLine({ productId, variantId, onHand, stock, labels }: {
  productId: string; variantId: string | null; onHand: number; stock: StockStatus | null; title: string | null; labels: ProductVariantsLabels;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(onHand));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = value !== String(onHand);

  function save() {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) { setError(labels.saveFailed); return; }
    setError(null);
    start(async () => {
      const res = await recordStockCount({ productId, variantId, countedOnHand: Math.trunc(parsed) });
      if (!res.ok) { setError(labels.saveFailed); return; }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
      <span className="tabular-nums">{labels.onHand}: {onHand}</span>
      <span className={`pill ${stock ? STOCK_TONE[stock] : 'pill-neutral'}`}>{stock ? labels.stockLabels[stock] : labels.noStock}</span>
      <input type="number" min={0} step="1" value={value} onChange={e => setValue(e.target.value)}
        aria-label={labels.stockCountLabel} className="input h-7 w-20 text-xs" />
      <button type="button" onClick={save} disabled={pending || !dirty} className="btn-outline h-7 text-xs">{labels.updateStock}</button>
      {error && <span className="text-bad">{error}</span>}
    </div>
  );
}

function DeleteVariantButton({ productId, variantId, labels }: { productId: string; variantId: string; labels: ProductVariantsLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  function remove() {
    if (!window.confirm(labels.deleteVariantConfirm)) return;
    start(async () => {
      const res = await deleteVariant(variantId, productId);
      if (!res.ok) { window.alert(labels.saveFailed); return; }
      router.refresh();
    });
  }
  return <button type="button" onClick={remove} disabled={pending} aria-label={labels.deleteVariant} className="btn-ghost h-7 w-7 shrink-0 px-0 text-bad"><Trash2 className="h-3.5 w-3.5" /></button>;
}
