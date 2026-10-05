'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { updateContentStatus, deleteContent } from '@/app/(app)/content/actions';
import { CONTENT_STATUS, type ContentStatus } from '@/lib/content/constants';

export interface ContentActionsLabels {
  edit: string; delete: string; deleteConfirm: string; saveFailed: string;
  statusLabels: Record<ContentStatus, string>;
}

/**
 * The two per-row controls a content list needs beyond the drawer link: a status
 * <select> to move a piece through the pipeline (the routine action — same idea as
 * `setTaskStatus` on Tasks and the inline key-result update on Goals) and delete.
 * Both are RLS-backed: `canEdit`/`canDelete` come from the server (mirroring
 * `content_update`/`content_delete`), so a member who doesn't own a piece sees the
 * status frozen as a plain pill instead of an editable control.
 */
export function ContentStatusControl({ id, status, canEdit, labels }: { id: string; status: ContentStatus; canEdit: boolean; labels: ContentActionsLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (!canEdit) return <span className="ct-pill ct-pill-neutral w-28 shrink-0 justify-center">{labels.statusLabels[status]}</span>;

  function onChange(next: ContentStatus) {
    start(async () => {
      const res = await updateContentStatus(id, next);
      if (!res.ok) { window.alert(labels.saveFailed); return; }
      router.refresh();
    });
  }

  return (
    <select value={status} disabled={pending} onChange={e => onChange(e.target.value as ContentStatus)}
      aria-label={labels.statusLabels[status]} className="ct-input h-8 w-28 shrink-0 text-xs">
      {CONTENT_STATUS.map(s => <option key={s} value={s}>{labels.statusLabels[s]}</option>)}
    </select>
  );
}

export function EditContentLink({ id, canEdit, labels }: { id: string; canEdit: boolean; labels: ContentActionsLabels }) {
  if (!canEdit) return null;
  return <Link href={`?edit=${id}`} scroll={false} aria-label={labels.edit} className="ct-btn ct-btn-ghost ct-btn-icon h-7 w-7 shrink-0"><Pencil className="h-3.5 w-3.5" /></Link>;
}

export function DeleteContentButton({ id, canDelete, labels }: { id: string; canDelete: boolean; labels: ContentActionsLabels }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!canDelete) return null;

  function remove() {
    if (!window.confirm(labels.deleteConfirm)) return;
    start(async () => {
      const res = await deleteContent(id);
      if (!res.ok) { window.alert(labels.saveFailed); return; }
      router.refresh();
    });
  }
  return <button type="button" onClick={remove} disabled={pending} aria-label={labels.delete} className="ct-btn ct-btn-ghost ct-btn-danger ct-btn-icon h-7 w-7 shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>;
}
