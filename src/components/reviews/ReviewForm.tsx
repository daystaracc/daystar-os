'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateReview } from '@/app/(app)/reviews/actions';
import type { ReviewType } from '@/lib/reviews/constants';

export interface ReviewFormLabels {
  wins: string; problems: string; decisions: string; priorities: string; notes: string;
  save: string; saving: string; saveFailed: string;
}

export interface ReviewFormValues { wins: string; problems: string; decisions: string; priorities: string; notes: string }

/**
 * The review itself — wins/problems/decisions/priorities, plus a free-text notes
 * field for monthly reviews (see the scope note on `updateReview` in
 * app/(app)/reviews/actions.ts for why monthly Q&A isn't a fixed question set yet).
 * Always visible, not behind a drawer or an Advanced toggle: unlike every CRUD
 * screen this session, this content isn't metadata about some other real-world
 * entity — it *is* the review, the same reasoning `SopDrawer.tsx` used to keep an
 * SOP's procedure text always visible.
 */
export function ReviewForm({ reviewId, type, initial, labels }: {
  reviewId: string; type: ReviewType; initial: ReviewFormValues; labels: ReviewFormLabels;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [wins, setWins] = useState(initial.wins);
  const [problems, setProblems] = useState(initial.problems);
  const [decisions, setDecisions] = useState(initial.decisions);
  const [priorities, setPriorities] = useState(initial.priorities);
  const [notes, setNotes] = useState(initial.notes);

  const dirty = wins !== initial.wins || problems !== initial.problems || decisions !== initial.decisions || priorities !== initial.priorities || notes !== initial.notes;

  function save() {
    setError(null);
    start(async () => {
      const res = await updateReview(reviewId, { wins, problems, decisions, priorities, ...(type === 'monthly' ? { notes } : {}) });
      if (!res.ok) { setError(labels.saveFailed); return; }
      router.refresh();
    });
  }

  return (
    <div className="card card-pad space-y-4">
      {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

      <Field label={labels.wins} value={wins} onChange={setWins} />
      <Field label={labels.problems} value={problems} onChange={setProblems} />
      <Field label={labels.decisions} value={decisions} onChange={setDecisions} />
      <Field label={labels.priorities} value={priorities} onChange={setPriorities} />
      {type === 'monthly' && <Field label={labels.notes} value={notes} onChange={setNotes} rows={5} />}

      <div className="flex justify-end">
        <button type="button" onClick={save} disabled={pending || !dirty} className="btn-primary">{pending ? labels.saving : labels.save}</button>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, rows = 3 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      <textarea rows={rows} maxLength={5000} value={value} onChange={e => onChange(e.target.value)} className="input h-auto py-2 leading-relaxed" />
    </label>
  );
}
