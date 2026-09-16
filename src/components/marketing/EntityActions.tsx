'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import type { ActionResult } from '@/lib/marketing/constants';

export interface EntityActionsLabels { edit: string; delete: string; deleteConfirm: string; deleteFailed: string }

/**
 * Edit opens the drawer (`?edit=1`); delete confirms, calls the given action, and
 * returns to `backHref`. Shared by the campaign and creator detail pages — both are
 * "manager+ edits anything, founder-only deletes" (the generic RLS loop), so one
 * component covers both instead of two near-identical copies (mirrors
 * `SopActions.tsx` / `ProductActions.tsx`).
 */
export function EntityActions({ id, canDelete, onDelete, backHref, labels }: {
  id: string; canDelete: boolean; onDelete: (id: string) => Promise<ActionResult>; backHref: string; labels: EntityActionsLabels;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  // `onDelete` is passed the raw server action reference (e.g. `deleteCampaign`),
  // never a wrapping closure — only an actual `'use server'` export can cross the
  // server/client boundary as a prop, so the id is applied here, not upstream.
  function remove() {
    if (!window.confirm(labels.deleteConfirm)) return;
    start(async () => {
      const res = await onDelete(id);
      if (!res.ok) { window.alert(labels.deleteFailed); return; }
      router.push(backHref);
    });
  }

  return (
    <div className="flex items-center gap-2">
      <Link href="?edit=1" scroll={false} className="btn-outline"><Pencil className="h-3.5 w-3.5" />{labels.edit}</Link>
      {canDelete && <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-bad"><Trash2 className="h-3.5 w-3.5" />{labels.delete}</button>}
    </div>
  );
}
