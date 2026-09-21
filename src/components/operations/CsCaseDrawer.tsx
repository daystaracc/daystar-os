'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import { createCsCase, updateCsCase, deleteCsCase } from '@/app/(app)/operations/actions';
import type { CsCaseRow } from '@/lib/data/operations';
import type { CsChannel, CsIssueType, CsStatus } from '@/lib/operations/constants';

export interface CsCaseDrawerLabels {
  newCase: string; editCase: string; customerName: string; orderRef: string; channel: string; issueType: string; status: string;
  owner: string; noOwner: string; resolution: string; notes: string; advanced: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string; deleteFailed: string;
  deleteCaseConfirm: string; deleteCase: string;
  channelLabels: Record<CsChannel, string>; issueTypeLabels: Record<CsIssueType, string>; statusLabels: Record<CsStatus, string>;
}

/**
 * Create/edit drawer for one `customer_service_cases` row. Status lives up front
 * (not under Advanced) because moving a case through open → waiting → resolved is
 * the main thing this drawer is opened to do, day to day — creating a brand-new
 * case is the less common path. `updateCsCase` stamps `resolved_at` server-side
 * whenever status becomes resolved/closed, so this form never sends a timestamp.
 */
export function CsCaseDrawer({ entry, owners, labels, onCloseHref }: {
  entry?: CsCaseRow; owners: { id: string; name: string }[]; labels: CsCaseDrawerLabels; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!entry;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [customerName, setCustomerName] = useState(entry?.customerName ?? '');
  const [orderRef, setOrderRef] = useState(entry?.orderRef ?? '');
  const [channel, setChannel] = useState<CsChannel>(entry?.channel ?? 'line');
  const [issueType, setIssueType] = useState<CsIssueType>(entry?.issueType ?? 'shipping');
  const [status, setStatus] = useState<CsStatus>(entry?.status ?? 'open');
  const [ownerId, setOwnerId] = useState(entry?.owner?.id ?? '');
  const [resolution, setResolution] = useState(entry?.resolution ?? '');
  const [notes, setNotes] = useState(entry?.notes ?? '');

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const base = { customerName, orderRef, channel, issueType, status, ownerId, resolution, notes };
      const res = editing ? await updateCsCase(entry.id, base) : await createCsCase(base);
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  function remove() {
    if (!entry) return;
    if (!window.confirm(labels.deleteCaseConfirm)) return;
    setError(null);
    start(async () => {
      const res = await deleteCsCase(entry.id);
      if (!res.ok) { setError(labels.deleteFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editCase : labels.newCase}
        className="relative flex h-full w-full max-w-[28rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editCase : labels.newCase}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.status}>
              <select value={status} onChange={e => setStatus(e.target.value as CsStatus)} className="input">
                {(Object.keys(labels.statusLabels) as CsStatus[]).map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.channel}>
                <select value={channel} onChange={e => setChannel(e.target.value as CsChannel)} className="input">
                  {(Object.keys(labels.channelLabels) as CsChannel[]).map(c => <option key={c} value={c}>{labels.channelLabels[c]}</option>)}
                </select>
              </Field>
              <Field label={labels.issueType}>
                <select value={issueType} onChange={e => setIssueType(e.target.value as CsIssueType)} className="input">
                  {(Object.keys(labels.issueTypeLabels) as CsIssueType[]).map(i => <option key={i} value={i}>{labels.issueTypeLabels[i]}</option>)}
                </select>
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.customerName}>
                <input maxLength={200} value={customerName} onChange={e => setCustomerName(e.target.value)} className="input" />
              </Field>
              <Field label={labels.orderRef}>
                <input maxLength={100} value={orderRef} onChange={e => setOrderRef(e.target.value)} className="input" />
              </Field>
            </div>

            <Field label={labels.owner}>
              <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input">
                <option value="">{labels.noOwner}</option>
                {owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </Field>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <Field label={labels.resolution}>
                  <textarea rows={3} maxLength={2000} value={resolution} onChange={e => setResolution(e.target.value)} className="input h-auto py-2 leading-relaxed" />
                </Field>
                <Field label={labels.notes}>
                  <textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
                </Field>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-4">
            {editing
              ? <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-bad"><Trash2 className="h-4 w-4" />{labels.deleteCase}</button>
              : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
              <button type="submit" disabled={pending} className="btn-primary">{pending ? labels.saving : editing ? labels.save : labels.create}</button>
            </div>
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
