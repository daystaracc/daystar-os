'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X } from 'lucide-react';
import { updateMembership } from '@/app/(app)/team/actions';
import type { MembershipRow } from '@/lib/data/team';

export interface MembershipDrawerOptions { departments: { id: string; name: string }[]; people: { id: string; name: string }[] }

export interface MembershipDrawerLabels {
  editMember: string; role: string; title: string; department: string; noDepartment: string; status: string;
  manager: string; noManager: string; startDate: string; advanced: string; ownRoleLocked: string;
  role_: { founder: string; manager: string; member: string }; status_: { active: string; inactive: string };
  save: string; saving: string; cancel: string; close: string; saveFailed: string;
}

/**
 * Edit-only drawer for one membership — no create/delete: memberships come from
 * real auth users signing up (`handle_new_user` trigger), not from typing a new
 * row here, same edit-only shape as `HealthDrawer.tsx`'s 11 fixed systems. Four
 * fields visible (role/status/title/department) + Advanced (manager/start date)
 * — same disclosure rule as every other drawer this session. `role` is disabled
 * when `isSelf` — see the note in app/(app)/team/actions.ts for why: the UI
 * shouldn't offer a founder a one-click way to lock themselves out, even though
 * the server re-checks it too.
 */
export function MembershipDrawer({ options, labels, member, isSelf, onCloseHref }: {
  options: MembershipDrawerOptions; labels: MembershipDrawerLabels; member: MembershipRow; isSelf: boolean; onCloseHref: string;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [title, setTitle] = useState(member.title ?? '');
  const [departmentId, setDepartmentId] = useState(member.departmentId ?? '');
  const [managerId, setManagerId] = useState(member.managerId ?? '');
  const [startDate, setStartDate] = useState(member.startDate ?? '');

  const close = () => router.push(onCloseHref, { scroll: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await updateMembership(member.id, { role, status, title, departmentId, managerId, startDate });
      if (!res.ok) { setError(labels.saveFailed); return; }
      close();
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button aria-label={labels.close} onClick={close} className="absolute inset-0 bg-ink/20" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-label={`${labels.editMember}: ${member.name}`}
        className="relative flex h-full w-full max-w-[28rem] animate-fade-up flex-col bg-surface shadow-drawer">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide">{labels.editMember} · {member.name}</h2>
          <button onClick={close} aria-label={labels.close} className="btn-ghost h-8 w-8 px-0"><X className="h-4 w-4" /></button>
        </header>

        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {error && <p className="rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

            <div className="grid grid-cols-2 gap-3">
              <Field label={labels.role}>
                <select value={role} disabled={isSelf} onChange={e => setRole(e.target.value as MembershipRow['role'])} className="input disabled:opacity-60">
                  <option value="founder">{labels.role_.founder}</option>
                  <option value="manager">{labels.role_.manager}</option>
                  <option value="member">{labels.role_.member}</option>
                </select>
                {isSelf && <p className="text-xs text-ink-3">{labels.ownRoleLocked}</p>}
              </Field>
              <Field label={labels.status}>
                <select value={status} onChange={e => setStatus(e.target.value as MembershipRow['status'])} className="input">
                  <option value="active">{labels.status_.active}</option>
                  <option value="inactive">{labels.status_.inactive}</option>
                </select>
              </Field>
            </div>

            <Field label={labels.title}>
              <input maxLength={200} value={title} onChange={e => setTitle(e.target.value)} className="input" />
            </Field>

            <Field label={labels.department}>
              <select value={departmentId} onChange={e => setDepartmentId(e.target.value)} className="input">
                <option value="">{labels.noDepartment}</option>
                {options.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>

            <button type="button" onClick={() => setAdvanced(a => !a)} aria-expanded={advanced}
              className="flex w-full items-center gap-1 border-t border-border pt-4 text-sm text-ink-2 hover:text-ink">
              {labels.advanced}
            </button>

            {advanced && (
              <div className="grid grid-cols-2 gap-3">
                <Field label={labels.manager}>
                  <select value={managerId} onChange={e => setManagerId(e.target.value)} className="input">
                    <option value="">{labels.noManager}</option>
                    {options.people.filter(p => p.id !== member.profileId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label={labels.startDate}>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input" />
                </Field>
              </div>
            )}
          </div>

          <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-5 py-4">
            <button type="button" onClick={close} className="btn-outline">{labels.cancel}</button>
            <button type="submit" disabled={pending} className="btn-primary">{pending ? labels.saving : labels.save}</button>
          </footer>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </label>
  );
}
