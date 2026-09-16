'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteSop } from '@/app/(app)/sops/actions';

export interface SopActionsLabels { edit: string; delete: string; deleteConfirm: string; deleteFailed: string }

/** Edit opens the drawer (`?edit=1`); delete confirms, calls the action, and returns to the list. Same shape as `ProductActions.tsx` / `ProjectActions.tsx` / `GoalActions.tsx`. */
export function SopActions({ sopId, canEdit, canDelete, labels }: {
  sopId: string; canEdit: boolean; canDelete: boolean; labels: SopActionsLabels;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (!window.confirm(labels.deleteConfirm)) return;
    start(async () => {
      const res = await deleteSop(sopId);
      if (!res.ok) { window.alert(labels.deleteFailed); return; }
      router.push('/sops');
    });
  }

  if (!canEdit && !canDelete) return null;
  return (
    <div className="flex items-center gap-2">
      {canEdit && <Link href="?edit=1" scroll={false} className="btn-outline"><Pencil className="h-3.5 w-3.5" />{labels.edit}</Link>}
      {canDelete && <button type="button" onClick={remove} disabled={pending} className="btn-ghost text-bad"><Trash2 className="h-3.5 w-3.5" />{labels.delete}</button>}
    </div>
  );
}
