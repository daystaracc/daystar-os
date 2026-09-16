'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2 } from 'lucide-react';
import { createCrmFlow, updateCrmFlow, deleteCrmFlow } from '@/app/(app)/crm/actions';
import { CRM_FLOW_CHANNEL, CRM_FLOW_STATUS, type CrmFlowKey, type CrmFlowChannel, type CrmFlowStatus } from '@/lib/crm/constants';

export interface CrmFlowDrawerOptions { owners: { id: string; name: string }[] }

export interface CrmFlowDrawerLabels {
  newFlow: string; editFlow: string; key: string; name: string; channel: string; status: string; audience: string;
  owner: string; noOwner: string; notes: string; messagesCount: string; sends: string; conversions: string; revenue: string; advanced: string;
  save: string; saving: string; cancel: string; create: string; close: string; saveFailed: string; deleteFailed: string;
  deleteFlow: string; deleteFlowConfirm: string; allFlowsCreated: string;
  channelLabels: Record<CrmFlowChannel, string>; statusLabels: Record<CrmFlowStatus, string>; keyLabels: Record<CrmFlowKey, string>;
}

export interface CrmFlowDraft {
  id: string; key: CrmFlowKey; name: string; channel: CrmFlowChannel; status: CrmFlowStatus; audience: string;
  ownerId: string; notes: string; messagesCount: string; sends: string; conversions: string; revenue: string;
}

/**
 * Create/edit drawer for a CRM flow. `key` (one of the 12 fixed automations) can
 * only be chosen on create, from whichever keys this org hasn't used yet — it's
 * shown as a plain label, not a control, when editing, since it identifies the
 * row (mirrors how a flow's identity works, not a value someone should casually
 * change). Delete lives in the footer here rather than a separate Actions
 * component, same shape as `AdSpendDrawer.tsx`, since a flow has no detail page.
 */
export function CrmFlowDrawer({ options, unusedKeys, labels, flow, onCloseHref }: {
  options: CrmFlowDrawerOptions; unusedKeys: CrmFlowKey[]; labels: CrmFlowDrawerLabels; flow?: CrmFlowDraft; onCloseHref: string;
}) {
  const router = useRouter();
  const editing = !!flow;
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [key, setKey] = useState<CrmFlowKey | ''>(flow?.key ?? unusedKeys[0] ?? '');
  const [name, setName] = useState(flow?.name ?? '');
  const [channel, setChannel] = useState<CrmFlowChannel>(flow?.channel ?? 'line');
  const [status, setStatus] = useState<CrmFlowStatus>(flow?.status ?? 'planned');
  const [audience, setAudience] = useState(flow?.audience ?? '');
  const [ownerId, setOwnerId] = useState(flow?.ownerId ?? '');
  const [notes, setNotes] = useState(flow?.notes ?? '');
  const [messagesCount, setMessagesCount] = useState(flow?.messagesCount ?? '0');
  const [sends, setSends] = useState(flow?.sends ?? '0');
  const [conversions, setConversions] = useState(flow?.conversions ?? '0');
  const [revenue, setRevenue] = useState(flow?.revenue ?? '0');

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
      const base = { name, channel, status, audience, owner_id: ownerId, notes, messages_count: messagesCount, sends, conversions, revenue };
      const res = editing ? await updateCrmFlow(flow.id, base) : await createCrmFlow({ ...base, key });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  function remove() {
    if (!flow) return;
    if (!window.confirm(labels.deleteFlowConfirm)) return;
    setError(null);
    start(async () => {
      const res = await deleteCrmFlow(flow.id);
      if (!res.ok) { setError(labels.deleteFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={editing ? labels.editFlow : labels.newFlow}
        className="relative flex h-full w-full max-w-[30rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{editing ? labels.editFlow : labels.newFlow}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <Field label={labels.key}>
              {editing ? (
                <p className="input flex items-center bg-muted text-ink-2">{labels.keyLabels[flow.key]}</p>
              ) : unusedKeys.length === 0 ? (
                <p className="text-xs text-ink-3">{labels.allFlowsCreated}</p>
              ) : (
                <select value={key} onChange={e => setKey(e.target.value as CrmFlowKey)} className="input">
                  {unusedKeys.map(k => <option key={k} value={k}>{labels.keyLabels[k]}</option>)}
                </select>
              )}
            </Field>

            <Field label={labels.name}>
              <input required maxLength={200} value={name} onChange={e => setName(e.target.value)} className="input" />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.channel}>
                <select value={channel} onChange={e => setChannel(e.target.value as CrmFlowChannel)} className="input">
                  {CRM_FLOW_CHANNEL.map(c => <option key={c} value={c}>{labels.channelLabels[c]}</option>)}
                </select>
              </Field>
              <Field label={labels.status}>
                <select value={status} onChange={e => setStatus(e.target.value as CrmFlowStatus)} className="input">
                  {CRM_FLOW_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
                </select>
              </Field>
            </div>

            <Field label={labels.audience}>
              <input maxLength={200} value={audience} onChange={e => setAudience(e.target.value)} className="input" />
            </Field>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="space-y-4">
                <Field label={labels.owner}>
                  <select value={ownerId} onChange={e => setOwnerId(e.target.value)} className="input">
                    <option value="">{labels.noOwner}</option>
                    {options.owners.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={labels.messagesCount}>
                    <input type="number" min={0} step="1" value={messagesCount} onChange={e => setMessagesCount(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.sends}>
                    <input type="number" min={0} step="1" value={sends} onChange={e => setSends(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.conversions}>
                    <input type="number" min={0} step="1" value={conversions} onChange={e => setConversions(e.target.value)} className="input" />
                  </Field>
                  <Field label={labels.revenue}>
                    <input type="number" min={0} step="1" value={revenue} onChange={e => setRevenue(e.target.value)} className="input" />
                  </Field>
                </div>
                <Field label={labels.notes}>
                  <textarea rows={3} maxLength={2000} value={notes} onChange={e => setNotes(e.target.value)} className="input h-auto py-2 leading-relaxed" />
                </Field>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-5 py-4">
            {editing
              ? <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-bad"><Trash2 className="h-4 w-4" />{labels.deleteFlow}</button>
              : <span />}
            <div className="flex items-center gap-2">
              <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
              <button type="submit" disabled={pending || !name.trim() || (!editing && !key)} className="btn-primary">
                {pending ? labels.saving : editing ? labels.save : labels.create}
              </button>
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
