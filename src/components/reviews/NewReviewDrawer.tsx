'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { createReview } from '@/app/(app)/reviews/actions';
import { weekBounds, shiftDays, previousMonthBounds } from '@/lib/calculations/pacing';
import { REVIEW_TYPE, type ReviewType } from '@/lib/reviews/constants';

export interface NewReviewDrawerLabels {
  newReview: string; type: string; periodStart: string; periodEnd: string;
  typeLabels: Record<ReviewType, string>;
  create: string; creating: string; cancel: string; close: string; saveFailed: string; duplicateFailed: string;
}

/** The most recently *completed* week (Mon–Sun) or calendar month as of today — a review is written about a period that's already over, not the one still in progress. */
function suggestedPeriod(type: ReviewType, today: string): { start: string; end: string } {
  return type === 'weekly' ? weekBounds(shiftDays(today, -7)) : previousMonthBounds(today);
}

/** New weekly/monthly review. Two fields (type, then the period it suggests) — no Advanced section, there's nothing else to set until the review itself is being written. */
export function NewReviewDrawer({ labels, today, onCloseHref }: { labels: NewReviewDrawerLabels; today: string; onCloseHref: string }) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [type, setType] = useState<ReviewType>('weekly');
  const [period, setPeriod] = useState(() => suggestedPeriod('weekly', today));

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function changeType(next: ReviewType) {
    setType(next);
    setPeriod(suggestedPeriod(next, today));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await createReview({ type, period_start: period.start, period_end: period.end });
      if (!res.ok) { setError(res.error === 'invalid' ? labels.duplicateFailed : labels.saveFailed); return; }
      router.push(`/reviews/${res.data}`);
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={labels.newReview}
        className="relative flex h-full w-full max-w-[26rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{labels.newReview}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{labels.type}</span>
              <select value={type} onChange={e => changeType(e.target.value as ReviewType)} className="input">
                {REVIEW_TYPE.map(t => <option key={t} value={t}>{labels.typeLabels[t]}</option>)}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">{labels.periodStart}</span>
                <input type="date" value={period.start} onChange={e => setPeriod(p => ({ ...p, start: e.target.value }))} className="input" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">{labels.periodEnd}</span>
                <input type="date" value={period.end} onChange={e => setPeriod(p => ({ ...p, end: e.target.value }))} className="input" />
              </label>
            </div>
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending || period.end < period.start} className="btn-primary">
              {pending ? labels.creating : labels.create}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}
