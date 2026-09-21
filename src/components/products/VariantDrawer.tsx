'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createVariant, updateVariant } from '@/app/(app)/products/actions';

export interface VariantDrawerLabels {
  newVariant: string; editVariant: string; variantName: string; sku: string; price: string; cost: string; attributes: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
}

export interface VariantDraft {
  id: string; name: string; sku: string; price: string; cost: string; attributes: Record<string, string>;
}

/** `"color: Black, size: M"` → `{ color: "Black", size: "M" }`. Blank input is `{}`, not an error. */
function parseAttributes(input: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of input.split(',')) {
    const [k, ...rest] = part.split(':');
    const key = k?.trim();
    const value = rest.join(':').trim();
    if (key && value) out[key] = value;
  }
  return out;
}
function formatAttributes(attrs: Record<string, string>): string {
  return Object.entries(attrs).map(([k, v]) => `${k}: ${v}`).join(', ');
}

/** Create/edit drawer for one variant under a product. */
export function VariantDrawer({ productId, labels, variant, onCloseHref }: {
  productId: string; labels: VariantDrawerLabels; variant?: VariantDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!variant;
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [name, setName] = useState(variant?.name ?? '');
  const [sku, setSku] = useState(variant?.sku ?? '');
  const [price, setPrice] = useState(variant?.price ?? '');
  const [cost, setCost] = useState(variant?.cost ?? '');
  const [attributesText, setAttributesText] = useState(variant ? formatAttributes(variant.attributes) : '');

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
      const base = { name, sku, price, cost, attributes: parseAttributes(attributesText) };
      const res = editing ? await updateVariant(variant.id, productId, base) : await createVariant({ product_id: productId, ...base });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editVariant : labels.newVariant}
        className="relative flex h-full w-full max-w-[26rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editVariant : labels.newVariant}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.variantName}>
              <input name="name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="input" />
            </Field>
            <Field label={labels.sku}>
              <input required maxLength={60} value={sku} onChange={e => setSku(e.target.value)} className="input" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.price}>
                <input type="number" min={0} step="1" value={price} onChange={e => setPrice(e.target.value)} className="input" />
              </Field>
              <Field label={labels.cost}>
                <input type="number" min={0} step="1" value={cost} onChange={e => setCost(e.target.value)} className="input" />
              </Field>
            </div>
            <Field label={labels.attributes}>
              <input maxLength={500} value={attributesText} onChange={e => setAttributesText(e.target.value)} className="input" />
            </Field>
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
