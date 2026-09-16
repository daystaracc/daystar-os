'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createCreator, updateCreator } from '@/app/(app)/marketing/actions';
import { CREATOR_PLATFORM, CREATOR_STATUS, type CreatorPlatform, type CreatorStatus } from '@/lib/marketing/constants';

export interface CreatorDrawerOptions { owners: { id: string; name: string }[] }

export interface CreatorDrawerLabels {
  newCreator: string; editCreator: string; name: string; handle: string; platform: string; status: string; market: string;
  followers: string; category: string; cost: string; owner: string; noOwner: string; contact: string; notes: string; advanced: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string;
  platformLabels: Record<CreatorPlatform, string>; statusLabels: Record<CreatorStatus, string>;
}

export interface CreatorDraft {
  id: string; name: string; handle: string; platform: CreatorPlatform; status: CreatorStatus; market: string;
  followers: string; category: string; cost: string; ownerId: string; contact: string; notes: string;
}

/** Create/edit drawer for a creator. Five fields visible (name/handle/platform/status/market) + Advanced (followers/category/cost/owner/contact/notes) — same disclosure rule as `ContentDrawer.tsx`. */
export function CreatorDrawer({ options, labels, creator, onCloseHref }: {
  options: CreatorDrawerOptions; labels: CreatorDrawerLabels; creator?: CreatorDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!creator;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [name, setName] = useState(creator?.name ?? '');
  const [handle, setHandle] = useState(creator?.handle ?? '');
  const [platform, setPlatform] = useState<CreatorPlatform>(creator?.platform ?? 'instagram');
  const [status, setStatus] = useState<CreatorStatus>(creator?.status ?? 'prospect');
  const [market, setMarket] = useState(creator?.market ?? 'TW');
  const [followers, setFollowers] = useState(creator?.followers ?? '');
  const [category, setCategory] = useState(creator?.category ?? '');
  const [cost, setCost] = useState(creator?.cost ?? '');
  const [ownerId, setOwnerId] = useState(creator?.ownerId ?? '');
  const [contact, setContact] = useState(creator?.contact ?? '');
  const [notes, setNotes] = useState(creator?.notes ?? '');

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
        name, handle, platform, status, market, followers, category, cost,
        owner_id: ownerId, contact, notes,
      };
      const res = editing ? await updateCreator(creator.id, base) : await createCreator(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editCreator : labels.newCreator}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editCreator : labels.newCreator}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.name}>
                <input name="name" required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="input" />
              </Field>
              <Field label={labels.handle}>
                <input maxLength={100} value={handle} onChange={e => setHandle(e.target.value)} className="input" />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Field label={labels.platform}>
                <select value={platform} onChange={e => setPlatform(e.target.value as CreatorPlatform)} className="input">
                  {CREATOR_PLATFORM.map(p => <option key={p} value={p}>{labels.platformLabels[p]}</option>)}
                </select>
              </Field>
              <Field label={labels.status}>
                <select value={status} onChange={e => setStatus(e.target.value as CreatorStatus)} className="input">
                  {CREATOR_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
                </select>
              </Field>
              <Field label={labels.market}>
                <input maxLength={50} value={market} onChange={e => setMarket(e.target.value)} className="input" />
              </Field>
            </div>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label={labels.followers}>
                    <input type="number" min={0} step="1" value={followers} onChange={e => setFollowers(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.category}>
                    <input maxLength={100} value={category} onChange={e => setCategory(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.cost}>
                    <input type="number" min={0} step="1" value={cost} onChange={e => setCost(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.owner}>
                    <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input">
                      <option value="">{labels.noOwner}</option>
                      {options.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label={labels.contact}>
                  <input maxLength={200} value={contact} onChange={e => setContact(e.target.value)} className="input" />
                </Field>
                <Field label={labels.notes}>
                  <textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
                </Field>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending || !name.trim()} className="btn-primary">
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
