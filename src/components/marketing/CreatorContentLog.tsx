'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { addCreatorContent, deleteCreatorContent } from '@/app/(app)/marketing/actions';
import type { CreatorContentRow } from '@/lib/data/marketing';

export interface CreatorContentLogLabels {
  contentLog: string; contentEmpty: string; addContent: string; productsSent: string; url: string; publishedAt: string;
  views: string; clicks: string; sales: string; cost: string; note: string;
  add: string; adding: string; cancel: string; deleteMetric: string; deleteContentConfirm: string; saveFailed: string; deleteFailed: string;
}

/** No sales/cost auto-tracking exists for creator collaborations — every row here is typed in by hand, same reasoning as `ReviewMetrics.tsx`'s manual metrics. */
export function CreatorContentLog({ creatorId, content, labels }: { creatorId: string; content: CreatorContentRow[]; labels: CreatorContentLogLabels }) {
  return (
    <div className="card">
      <div className="px-5 py-3"><span className="label">{labels.contentLog}</span></div>

      {content.length === 0 ? (
        <p className="px-5 pb-2 text-sm text-ink-3">{labels.contentEmpty}</p>
      ) : (
        <ul className="space-y-1.5 px-5 pb-2">
          {content.map(c => <ContentLine key={c.id} creatorId={creatorId} item={c} labels={labels} />)}
        </ul>
      )}

      <AddContentForm creatorId={creatorId} labels={labels} />
    </div>
  );
}

function ContentLine({ creatorId, item, labels }: { creatorId: string; item: CreatorContentRow; labels: CreatorContentLogLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (!window.confirm(labels.deleteContentConfirm)) return;
    start(async () => {
      const res = await deleteCreatorContent(item.id, creatorId);
      if (!res.ok) { window.alert(labels.deleteFailed); return; }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 tabular-nums text-ink-2">{item.publishedAt ?? '—'}</span>
      <span className="min-w-0 flex-1 truncate">{item.productsSent ?? '—'}</span>
      <span className="w-16 shrink-0 tabular-nums text-ink-3">{item.views}</span>
      <span className="w-20 shrink-0 tabular-nums">${item.sales.toLocaleString()}</span>
      {item.url && <a href={item.url} target="_blank" rel="noreferrer" className="hidden shrink-0 text-xs text-accent underline md:inline">{labels.url}</a>}
      <button type="button" onClick={remove} disabled={pending} aria-label={labels.deleteMetric} className="btn-ghost h-6 w-6 shrink-0 px-0 text-bad"><Trash2 className="h-3 w-3" /></button>
    </li>
  );
}

function AddContentForm({ creatorId, labels }: { creatorId: string; labels: CreatorContentLogLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [productsSent, setProductsSent] = useState('');
  const [url, setUrl] = useState('');
  const [publishedAt, setPublishedAt] = useState('');
  const [views, setViews] = useState('0');
  const [clicks, setClicks] = useState('0');
  const [sales, setSales] = useState('0');
  const [cost, setCost] = useState('0');
  const [note, setNote] = useState('');

  if (!open) {
    return (
      <div className="px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className="btn-outline h-8 text-xs"><Plus className="h-3.5 w-3.5" />{labels.addContent}</button>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addCreatorContent({ creatorId, productsSent, url, publishedAt, views, clicks, sales, cost, note });
      if (!res.ok) { setError(labels.saveFailed); return; }
      setProductsSent(''); setUrl(''); setPublishedAt(''); setViews('0'); setClicks('0'); setSales('0'); setCost('0'); setNote(''); setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border px-5 py-3">
      {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <input placeholder={labels.productsSent} maxLength={500} value={productsSent} onChange={e => setProductsSent(e.target.value)} className="input h-8 text-xs" />
        <input type="url" placeholder={labels.url} maxLength={500} value={url} onChange={e => setUrl(e.target.value)} className="input h-8 text-xs" />
        <input type="date" aria-label={labels.publishedAt} value={publishedAt} onChange={e => setPublishedAt(e.target.value)} className="input h-8 text-xs" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input type="number" min={0} step="1" placeholder={labels.views} value={views} onChange={e => setViews(e.target.value)} className="input h-8 text-xs" />
        <input type="number" min={0} step="1" placeholder={labels.clicks} value={clicks} onChange={e => setClicks(e.target.value)} className="input h-8 text-xs" />
        <input type="number" min={0} step="1" placeholder={labels.sales} value={sales} onChange={e => setSales(e.target.value)} className="input h-8 text-xs" />
        <input type="number" min={0} step="1" placeholder={labels.cost} value={cost} onChange={e => setCost(e.target.value)} className="input h-8 text-xs" />
      </div>
      <input placeholder={labels.note} maxLength={500} value={note} onChange={e => setNote(e.target.value)} className="input h-8 text-xs" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-outline h-8 text-xs">{labels.cancel}</button>
        <button type="submit" disabled={pending} className="btn-primary h-8 text-xs">{pending ? labels.adding : labels.add}</button>
      </div>
    </form>
  );
}
