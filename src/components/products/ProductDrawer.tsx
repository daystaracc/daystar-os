'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createProduct, updateProduct } from '@/app/(app)/products/actions';
import { PRODUCT_TIER, PRODUCT_STATUS, type ProductTier, type ProductStatus } from '@/lib/products/constants';

export interface ProductDrawerOptions { suppliers: { id: string; name: string }[] }

export interface ProductDrawerLabels {
  newProduct: string; editProduct: string; name: string; sku: string; category: string; collection: string;
  tier: string; status: string; price: string; cost: string; supplier: string; hero: string;
  weight: string; material: string; specification: string; color: string; size: string;
  launchDate: string; imageUrl: string; notes: string; noSupplier: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  tierLabels: Record<ProductTier, string>; statusLabels: Record<ProductStatus, string>; advanced: string;
}

export interface ProductDraft {
  id: string; name: string; sku: string; category: string; collection: string; tier: ProductTier; status: ProductStatus;
  price: string; cost: string; supplierId: string; isHero: boolean;
  weightG: string; material: string; specification: string; color: string; size: string;
  launchDate: string; imageUrl: string; notes: string;
}

/** Create/edit drawer for a product. Five fields visible (name/sku/tier/status/price) + Advanced — same disclosure rule as `TaskDrawer.tsx` / `ProjectDrawer.tsx`. */
export function ProductDrawer({ options, labels, product, onCloseHref }: {
  options: ProductDrawerOptions; labels: ProductDrawerLabels; product?: ProductDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!product;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [name, setName] = useState(product?.name ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [tier, setTier] = useState<ProductTier>(product?.tier ?? 'core');
  const [status, setStatus] = useState<ProductStatus>(product?.status ?? 'draft');
  const [price, setPrice] = useState(product?.price ?? '0');
  const [cost, setCost] = useState(product?.cost ?? '');
  const [category, setCategory] = useState(product?.category ?? '');
  const [collection, setCollection] = useState(product?.collection ?? '');
  const [supplierId, setSupplierId] = useState(product?.supplierId ?? '');
  const [isHero, setIsHero] = useState(product?.isHero ?? false);
  const [weightG, setWeightG] = useState(product?.weightG ?? '');
  const [material, setMaterial] = useState(product?.material ?? '');
  const [specification, setSpecification] = useState(product?.specification ?? '');
  const [color, setColor] = useState(product?.color ?? '');
  const [size, setSize] = useState(product?.size ?? '');
  const [launchDate, setLaunchDate] = useState(product?.launchDate ?? '');
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? '');
  const [notes, setNotes] = useState(product?.notes ?? '');

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const base = {
        name, sku, category, collection, tier, status, price, cost, supplier_id: supplierId, is_hero: isHero,
        weight_g: weightG, material, specification, color, size, launch_date: launchDate, image_url: imageUrl, notes,
      };
      const res = editing ? await updateProduct(product.id, base) : await createProduct(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editProduct : labels.newProduct}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editProduct : labels.newProduct}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.name}>
              <input name="name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="input" />
            </Field>
            <Field label={labels.sku}>
              <input required maxLength={60} value={sku} onChange={e => setSku(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.tier}>
                <select value={tier} onChange={e => setTier(e.target.value as ProductTier)} className="input">
                  {PRODUCT_TIER.map(t => <option key={t} value={t}>{labels.tierLabels[t]}</option>)}
                </select>
              </Field>
              <Field label={labels.status}>
                <select value={status} onChange={e => setStatus(e.target.value as ProductStatus)} className="input">
                  {PRODUCT_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
                </select>
              </Field>
              <Field label={labels.price}>
                <input type="number" min={0} step="1" required value={price} onChange={e => setPrice(e.target.value)} className="input" />
              </Field>
              <Field label={labels.cost}>
                <input type="number" min={0} step="1" value={cost} onChange={e => setCost(e.target.value)} className="input" />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isHero} onChange={e => setIsHero(e.target.checked)} className="h-4 w-4" />
              {labels.hero}
            </label>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={labels.category}>
                    <input maxLength={100} value={category} onChange={e => setCategory(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.collection}>
                    <input maxLength={100} value={collection} onChange={e => setCollection(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.supplier}>
                    <select value={supplierId} onChange={e => setSupplierId(e.target.value)} className="input">
                      <option value="">{labels.noSupplier}</option>
                      {options.suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                  <Field label={labels.weight}>
                    <input type="number" min={0} step="1" value={weightG} onChange={e => setWeightG(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.material}>
                    <input maxLength={200} value={material} onChange={e => setMaterial(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.specification}>
                    <input maxLength={200} value={specification} onChange={e => setSpecification(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.color}>
                    <input maxLength={100} value={color} onChange={e => setColor(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.size}>
                    <input maxLength={100} value={size} onChange={e => setSize(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.launchDate}>
                    <input type="date" value={launchDate} onChange={e => setLaunchDate(e.target.value)} className="input" />
                  </Field>
                </div>
                <Field label={labels.imageUrl}>
                  <input type="url" maxLength={1000} value={imageUrl} onChange={e => setImageUrl(e.target.value)} className="input" />
                </Field>
                <Field label={labels.notes}>
                  <textarea rows={3} maxLength={5000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
                </Field>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending || !name.trim() || !sku.trim()} className="btn-primary">
              {pending ? labels.saving : editing ? labels.save : labels.create}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
