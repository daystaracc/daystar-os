'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { deleteProject } from '@/app/(app)/projects/actions';

export interface ProjectActionsLabels { edit: string; delete: string; deleteConfirm: string; deleteFailed: string }

/** Edit opens the drawer (`?edit=1`); delete confirms, calls the action, and returns to the list. */
export function ProjectActions({ projectId, canEdit, canDelete, labels }: {
  projectId: string; canEdit: boolean; canDelete: boolean; labels: ProjectActionsLabels;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function remove() {
    if (!window.confirm(labels.deleteConfirm)) return;
    start(async () => {
      const res = await deleteProject(projectId);
      if (!res.ok) { window.alert(labels.deleteFailed); return; }
      router.push('/projects');
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
