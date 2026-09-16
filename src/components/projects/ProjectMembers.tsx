'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus, X } from 'lucide-react';
import { addProjectMember, removeProjectMember } from '@/app/(app)/projects/actions';
import type { ProjectMember } from '@/lib/data/projects';

export interface ProjectMembersLabels {
  members: string; addMember: string; removeMember: string; memberNone: string; saveFailed: string;
}

/**
 * Member list for a project detail page. `project_members_write` RLS is
 * manager-or-above on the parent project's organization — `canManage` mirrors that
 * so the add/remove controls only render for roles the database would actually let
 * write, same reasoning as `canEditTask`/`canDeleteTask` in `lib/permissions.ts`.
 */
export function ProjectMembers({ projectId, members, peopleOptions, canManage, labels }: {
  projectId: string; members: ProjectMember[]; peopleOptions: { id: string; name: string }[]; canManage: boolean; labels: ProjectMembersLabels;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [pending, start] = useTransition();

  const available = peopleOptions.filter(p => !members.some(m => m.profileId === p.id));

  function add() {
    if (!selected) return;
    setError(null);
    start(async () => {
      const res = await addProjectMember(projectId, selected);
      if (!res.ok) { setError(labels.saveFailed); return; }
      setSelected('');
      router.refresh();
    });
  }

  function remove(profileId: string) {
    setError(null);
    start(async () => {
      const res = await removeProjectMember(projectId, profileId);
      if (!res.ok) { setError(labels.saveFailed); return; }
      router.refresh();
    });
  }

  return (
    <div className="card card-pad space-y-3">
      <div className="label">{labels.members}</div>
      {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}
      {members.length === 0 && <p className="text-sm text-ink-3">{labels.memberNone}</p>}
      <ul className="space-y-1.5">
        {members.map(m => (
          <li key={m.profileId} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{m.name}</span>
            {canManage && (
              <button type="button" onClick={() => remove(m.profileId)} disabled={pending}
                aria-label={`${labels.removeMember}: ${m.name}`} className="btn-ghost h-7 w-7 shrink-0 px-0"><X className="h-3.5 w-3.5" /></button>
            )}
          </li>
        ))}
      </ul>
      {canManage && available.length > 0 && (
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <select value={selected} onChange={e => setSelected(e.target.value)} className="input">
            <option value="">{labels.addMember}</option>
            {available.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button type="button" onClick={add} disabled={pending || !selected} aria-label={labels.addMember} className="btn-outline h-9 w-9 shrink-0 px-0">
            <UserPlus className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
