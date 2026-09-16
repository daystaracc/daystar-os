'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { addCampaignMetric, deleteCampaignMetric } from '@/app/(app)/marketing/actions';
import type { CampaignMetricRow } from '@/lib/data/marketing';

export interface CampaignMetricsLabels {
  campaignMetrics: string; metricsEmpty: string; addDay: string; date: string; revenue: string; orders: string; spend: string;
  add: string; adding: string; cancel: string; deleteMetric: string; deleteMetricConfirm: string; saveFailed: string; deleteFailed: string;
}

/** One row per day (date/revenue/orders/spend) — adding a date that's already logged REPLACES it (upsert on `unique(campaign_id, date)`), same idiom as the Revenue screen's manual entry. Mirrors `ReviewMetrics.tsx`'s collapsed add-form. */
export function CampaignMetrics({ campaignId, metrics, labels }: { campaignId: string; metrics: CampaignMetricRow[]; labels: CampaignMetricsLabels }) {
  return (
    <div className="card">
      <div className="px-5 py-3"><span className="label">{labels.campaignMetrics}</span></div>

      {metrics.length === 0 ? (
        <p className="px-5 pb-2 text-sm text-ink-3">{labels.metricsEmpty}</p>
      ) : (
        <ul className="space-y-1.5 px-5 pb-2">
          {metrics.map(m => <MetricLine key={m.id} campaignId={campaignId} metric={m} labels={labels} />)}
        </ul>
      )}

      <AddMetricForm campaignId={campaignId} labels={labels} />
    </div>
  );
}

function MetricLine({ campaignId, metric, labels }: { campaignId: string; metric: CampaignMetricRow; labels: CampaignMetricsLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (!window.confirm(labels.deleteMetricConfirm)) return;
    start(async () => {
      const res = await deleteCampaignMetric(metric.id, campaignId);
      if (!res.ok) { window.alert(labels.deleteFailed); return; }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-md border border-border/60 px-3 py-1.5 text-sm">
      <span className="w-24 shrink-0 tabular-nums text-ink-2">{metric.date}</span>
      <span className="min-w-[5rem] flex-1 tabular-nums">${metric.revenue.toLocaleString()}</span>
      <span className="w-16 shrink-0 tabular-nums text-ink-3">{metric.orders}</span>
      <span className="w-20 shrink-0 tabular-nums text-ink-3">${metric.spend.toLocaleString()}</span>
      <button type="button" onClick={remove} disabled={pending} aria-label={labels.deleteMetric} className="btn-ghost h-6 w-6 shrink-0 px-0 text-bad"><Trash2 className="h-3 w-3" /></button>
    </li>
  );
}

function AddMetricForm({ campaignId, labels }: { campaignId: string; labels: CampaignMetricsLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [revenue, setRevenue] = useState('0');
  const [orders, setOrders] = useState('0');
  const [spend, setSpend] = useState('0');

  if (!open) {
    return (
      <div className="px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className="btn-outline h-8 text-xs"><Plus className="h-3.5 w-3.5" />{labels.addDay}</button>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addCampaignMetric({ campaignId, date, revenue, orders, spend });
      if (!res.ok) { setError(labels.saveFailed); return; }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border px-5 py-3">
      {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input type="date" required value={date} onChange={e => setDate(e.target.value)} aria-label={labels.date} className="input h-8 text-xs" />
        <input type="number" min={0} step="1" placeholder={labels.revenue} value={revenue} onChange={e => setRevenue(e.target.value)} className="input h-8 text-xs" />
        <input type="number" min={0} step="1" placeholder={labels.orders} value={orders} onChange={e => setOrders(e.target.value)} className="input h-8 text-xs" />
        <input type="number" min={0} step="1" placeholder={labels.spend} value={spend} onChange={e => setSpend(e.target.value)} className="input h-8 text-xs" />
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-outline h-8 text-xs">{labels.cancel}</button>
        <button type="submit" disabled={pending} className="btn-primary h-8 text-xs">{pending ? labels.adding : labels.add}</button>
      </div>
    </form>
  );
}
