'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { addReviewMetric, deleteReviewMetric } from '@/app/(app)/reviews/actions';
import { pctChange, formatDelta } from '@/lib/calculations/format';
import { REVIEW_SECTION, type ReviewSection } from '@/lib/reviews/constants';
import type { ReviewMetricRow } from '@/lib/data/reviews';

export interface ReviewMetricsLabels {
  metrics: string; empty: string; addMetric: string; section: string; metric: string; value: string; previousValue: string; note: string;
  add: string; adding: string; cancel: string; delete: string; deleteConfirm: string; saveFailed: string; deleteFailed: string;
  sectionLabels: Record<ReviewSection, string>;
}

const SECTION_ORDER: ReviewSection[] = ['growth', 'product', 'content', 'crm', 'operations', 'finance', 'team'];

/**
 * No automatic pre-fill (see the scope note in lib/data/reviews.ts) — every row
 * here was typed in by hand. Grouped by section so the "growth / product / content
 * / crm / operations / finance / team" structure the spec describes is visible even
 * though nothing populates it automatically yet.
 */
export function ReviewMetrics({ reviewId, metrics, labels }: { reviewId: string; metrics: ReviewMetricRow[]; labels: ReviewMetricsLabels }) {
  const bySection = new Map<ReviewSection, ReviewMetricRow[]>();
  for (const m of metrics) bySection.set(m.section, [...(bySection.get(m.section) ?? []), m]);

  return (
    <div className="card">
      <div className="px-5 py-3"><span className="label">{labels.metrics}</span></div>

      {metrics.length === 0 ? (
        <p className="px-5 pb-2 text-sm text-ink-3">{labels.empty}</p>
      ) : (
        <div className="space-y-3 px-5 pb-2">
          {SECTION_ORDER.filter(s => bySection.has(s)).map(s => (
            <div key={s}>
              <div className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-3">{labels.sectionLabels[s]}</div>
              <ul className="space-y-1.5">
                {bySection.get(s)!.map(m => (
                  <MetricLine key={m.id} reviewId={reviewId} metric={m} labels={labels} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <AddMetricForm reviewId={reviewId} labels={labels} />
    </div>
  );
}

function MetricLine({ reviewId, metric, labels }: { reviewId: string; metric: ReviewMetricRow; labels: ReviewMetricsLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const delta = metric.value !== null ? pctChange(metric.value, metric.previousValue) : null;

  function remove() {
    if (!window.confirm(labels.deleteConfirm)) return;
    start(async () => {
      const res = await deleteReviewMetric(metric.id, reviewId);
      if (!res.ok) { window.alert(labels.deleteFailed); return; }
      router.refresh();
    });
  }

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm">
      <span className="min-w-0 flex-1 truncate">{metric.metric}</span>
      <span className="shrink-0 tabular-nums">{metric.value ?? '—'}</span>
      {metric.previousValue !== null && <span className="shrink-0 text-xs tabular-nums text-ink-3">{formatDelta(delta)}</span>}
      {metric.note && <span className="hidden shrink-0 text-xs text-ink-3 md:inline">{metric.note}</span>}
      <button type="button" onClick={remove} disabled={pending} aria-label={labels.delete} className="btn-ghost h-6 w-6 shrink-0 px-0 text-bad"><Trash2 className="h-3 w-3" /></button>
    </li>
  );
}

function AddMetricForm({ reviewId, labels }: { reviewId: string; labels: ReviewMetricsLabels }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [section, setSection] = useState<ReviewSection>('growth');
  const [metric, setMetric] = useState('');
  const [value, setValue] = useState('');
  const [previousValue, setPreviousValue] = useState('');
  const [note, setNote] = useState('');

  if (!open) {
    return (
      <div className="px-5 py-3">
        <button type="button" onClick={() => setOpen(true)} className="btn-outline h-8 text-xs"><Plus className="h-3.5 w-3.5" />{labels.addMetric}</button>
      </div>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await addReviewMetric({ reviewId, section, metric, value, previousValue, note });
      if (!res.ok) { setError(labels.saveFailed); return; }
      setMetric(''); setValue(''); setPreviousValue(''); setNote(''); setOpen(false);
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2 border-t border-border px-5 py-3">
      {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-xs text-bad">{error}</p>}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <select value={section} onChange={e => setSection(e.target.value as ReviewSection)} aria-label={labels.section} className="input h-8 text-xs">
          {REVIEW_SECTION.map(s => <option key={s} value={s}>{labels.sectionLabels[s]}</option>)}
        </select>
        <input required maxLength={100} placeholder={labels.metric} value={metric} onChange={e => setMetric(e.target.value)} className="input h-8 text-xs" />
        <input type="number" step="any" placeholder={labels.value} value={value} onChange={e => setValue(e.target.value)} className="input h-8 text-xs" />
        <input type="number" step="any" placeholder={labels.previousValue} value={previousValue} onChange={e => setPreviousValue(e.target.value)} className="input h-8 text-xs" />
      </div>
      <input maxLength={500} placeholder={labels.note} value={note} onChange={e => setNote(e.target.value)} className="input h-8 text-xs" />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="btn-outline h-8 text-xs">{labels.cancel}</button>
        <button type="submit" disabled={pending || !metric.trim()} className="btn-primary h-8 text-xs">{pending ? labels.adding : labels.add}</button>
      </div>
    </form>
  );
}
