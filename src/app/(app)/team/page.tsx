import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getTeamPage } from '@/lib/data/team';
import { MembershipDrawer } from '@/components/team/MembershipDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const ROLE_PILL = { founder: 'pill-ok', manager: 'pill-neutral', member: 'pill-neutral' } as const;
const STATUS_PILL = { active: 'pill-ok', inactive: 'pill-neutral' } as const;

/**
 * TEAM (spec §13) — "Who owns what, who is loaded?" Unlike every other screen
 * built this session, this one is open to **every** active member to read — see
 * the file-level note in lib/team/constants.ts. Only a founder sees the edit
 * pencil; `updateMembership` (app/(app)/team/actions.ts) re-checks that
 * server-side rather than trusting this UI.
 *
 * Edit-only, same shape as Company Health's 11 fixed systems: memberships come
 * from real people signing up (`handle_new_user` trigger), not from typing a new
 * row here — see the scope note in lib/data/team.ts for what's deliberately not
 * built (department management).
 */
export default async function TeamPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');
  const role = m.role as Role;
  const { t, locale } = await getT(profile?.locale);

  const page = await getTeamPage(m.organization_id, locale);
  const canEdit = role === 'founder';

  const editId = first(sp.edit);
  const editing = canEdit && editId ? page.rows.find(r => r.id === editId) : undefined;

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('team.heading')}</h1>
        <span className="text-sm tabular-nums text-ink-3">{t('team.memberCount', { n: page.rows.length })}</span>
      </header>

      {page.error ? (
        <div className="card card-pad text-sm text-bad">{t('team.loadFailed')}</div>
      ) : !page.rows.length ? (
        <div className="card card-pad text-sm text-ink-3">{t('team.empty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {page.rows.map(r => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <p className="truncate text-sm font-medium">{r.name || r.email || '—'}</p>
                {r.title && <p className="truncate text-xs text-ink-3">{r.title}</p>}
              </div>
              <span className={`pill ${ROLE_PILL[r.role]} w-20 shrink-0 justify-center`}>{t(`team.role_.${r.role}`)}</span>
              <span className="hidden w-28 shrink-0 truncate text-xs text-ink-3 md:block">{r.departmentName ?? '—'}</span>
              <span className="hidden w-32 shrink-0 truncate text-xs text-ink-3 lg:block">
                {t('team.openTasks', { n: r.openTasks })}{r.overdueTasks > 0 ? ` · ${t('team.overdueTasks', { n: r.overdueTasks })}` : ''}
              </span>
              <span className={`pill ${STATUS_PILL[r.status]} w-16 shrink-0 justify-center`}>{t(`team.status_.${r.status}`)}</span>
              {canEdit && <Link href={`?edit=${r.id}`} scroll={false} aria-label={t('common.edit')} className="btn-ghost h-7 w-7 shrink-0 px-0"><Pencil className="h-3.5 w-3.5" /></Link>}
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <MembershipDrawer options={page.options} member={editing} isSelf={editing.profileId === user.id} onCloseHref="/team"
          labels={{
            editMember: t('team.editMember'), role: t('team.role'), title: t('team.title'), department: t('team.department'),
            noDepartment: t('team.noDepartment'), status: t('team.status'), manager: t('team.manager'), noManager: t('team.noManager'),
            startDate: t('team.startDate'), advanced: t('team.advanced'), ownRoleLocked: t('team.ownRoleLocked'),
            role_: { founder: t('team.role_.founder'), manager: t('team.role_.manager'), member: t('team.role_.member') },
            status_: { active: t('team.status_.active'), inactive: t('team.status_.inactive') },
            save: t('team.save'), saving: t('team.saving'), cancel: t('team.cancel'), close: t('common.close'), saveFailed: t('team.saveFailed'),
          }} />
      )}
    </div>
  );
}
