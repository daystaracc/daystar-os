'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createSop, updateSop } from '@/app/(app)/sops/actions';
import { SOP_CATEGORY, SOP_STATUS, type SopCategory, type SopStatus } from '@/lib/sops/constants';

export interface SopDrawerOptions { owners: { id: string; name: string }[] }

export interface SopDrawerLabels {
  newSop: string; editSop: string; title: string; category: string; status: string; owner: string; content: string;
  noOwner: string; save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  categoryLabels: Record<SopCategory, string>; statusLabels: Record<SopStatus, string>;
}

export interface SopDraft {
  id: string; title: string; category: SopCategory; status: SopStatus; ownerId: string; contentMd: string;
}

/**
 * Create/edit drawer for an SOP. Only five fields exist at all here (title,
 * category, status, owner, content) so — unlike every other drawer this session —
 * there's no "Advanced" toggle: the procedure text is the point of an SOP, not
 * secondary detail to hide, so it's always visible as a full-height textarea rather
 * than a two-line field squeezed in with the rest.
 */
export function SopDrawer({ options, labels, sop, onCloseHref }: {
  options: SopDrawerOptions; labels: SopDrawerLabels; sop?: SopDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!sop;
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [title, setTitle] = useState(sop?.title ?? '');
  const [category, setCategory] = useState<SopCategory>(sop?.category ?? 'other');
  const [status, setStatus] = useState<SopStatus>(sop?.status ?? 'draft');
  const [ownerId, setOwnerId] = useState(sop?.ownerId ?? '');
  const [contentMd, setContentMd] = useState(sop?.contentMd ?? '');

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    panelRef.current?.querySelector<HTMLInputElement>('input[name="title"]')?.focus();
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const base = { title, category, status, owner_id: ownerId, content_md: contentMd };
      const res = editing ? await updateSop(sop.id, base) : await createSop(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editSop : labels.newSop}
        className="relative flex h-full w-full max-w-[36rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editSop : labels.newSop}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex min-h-0 flex-1 flex-col space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.title}>
              <input name="title" required maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label={labels.category}>
                <select value={category} onChange={e => setCategory(e.target.value as SopCategory)} className="input">
                  {SOP_CATEGORY.map(c => <option key={c} value={c}>{labels.categoryLabels[c]}</option>)}
                </select>
              </Field>
              <Field label={labels.status}>
                <select value={status} onChange={e => setStatus(e.target.value as SopStatus)} className="input">
                  {SOP_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
                </select>
              </Field>
              <Field label={labels.owner}>
                <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input">
                  <option value="">{labels.noOwner}</option>
                  {options.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              </Field>
            </div>

            <label className="flex min-h-0 flex-1 flex-col space-y-1.5">
              <span className="text-sm font-medium">{labels.content}</span>
              <textarea value={contentMd} onChange={e => setContentMd(e.target.value)} maxLength={50000}
                className="input h-auto min-h-[16rem] flex-1 py-2 font-mono text-xs leading-relaxed" />
            </label>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending || !title.trim()} className="btn-primary">
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
