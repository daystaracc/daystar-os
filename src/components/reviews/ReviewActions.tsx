'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { completeReview, reopenReview, deleteReview } from '@/app/(app)/reviews/actions';
import type { ReviewStatus } from '@/lib/reviews/constants';

export interface ReviewActionsLabels {
  markComplete: string; reopen: string; delete: string; deleteConfirm: string; saveFailed: string; deleteFailed: string;
}

/** Mark complete / reopen is the routine action (mirrors `setTaskStatus` / `updateContentStatus`); delete is founder-only, mirroring `ProductActions.tsx` / `SopActions.tsx`. */
export function ReviewActions({ reviewId, status, canDelete, labels }: {
  reviewId: string; status: ReviewStatus; canDelete: boolean; labels: ReviewActionsLabels;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const res = status === 'draft' ? await completeReview(reviewId) : await reopenReview(reviewId);
      if (!res.ok) { window.alert(labels.saveFailed); return; }
      router.refresh();
    });
  }

  function remove() {
    if (!window.confirm(labels.deleteConfirm)) return;
    start(async () => {
      const res = await deleteReview(reviewId);
      if (!res.ok) { window.alert(labels.deleteFailed); return; }
      router.push('/reviews');
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={toggle} disabled={pending} className="btn-outline">
        {status === 'draft' ? labels.markComplete : labels.reopen}
      </button>
      {canDelete && <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-bad"><Trash2 className="h-3.5 w-3.5" />{labels.delete}</button>}
    </div>
  );
}
