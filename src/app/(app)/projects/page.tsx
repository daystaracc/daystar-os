import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, FolderKanban } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getProjectsPage } from '@/lib/data/projects';
import { PROJECT_STATUS } from '@/lib/projects/constants';
import { ProjectDrawer } from '@/components/projects/ProjectDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const HEALTH_TONE = { healthy: 'pill-ok', at_risk: 'pill-warn', critical: 'pill-bad' } as const;
const HEALTH_BAR = { healthy: 'bg-ok', at_risk: 'bg-warn', critical: 'bg-bad' } as const;

/**
 * PROJECTS (spec §03) — "What are we executing, is it healthy?"
 *
 * Read access mirrors the `projects_select` RLS policy: every active member of the
 * organization, not just founder/manager — the info architecture calls this "own"
 * for members, but the current RLS (migration 0002's generic per-table loop) grants
 * read to the whole org and write to manager-or-above; this screen follows the RLS
 * that actually exists rather than the aspirational spec column (see ARCHITECTURE
 * §0's note on this before changing it — that needs a migration, not a UI decision).
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Search> }) {
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

  const page = await getProjectsPage(m.organization_id, role, locale);
  const canManage = role === 'founder' || role === 'manager';
  const drawerOpen = first(sp.new) === '1' && canManage;

  const statusLabels = Object.fromEntries(PROJECT_STATUS.map(s => [s, t(`common.status.${s}`)])) as Record<(typeof PROJECT_STATUS)[number], string>;
  const healthLabels = { healthy: t('common.status.healthy'), at_risk: t('common.status.at_risk'), critical: t('common.status.critical') };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('projects.heading')}</h1>
        {canManage && <Link href="?new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('projects.newProject')}</Link>}
      </header>

      {page.error ? (
        <div className="card card-pad text-sm text-bad">{t('projects.loadFailed')}</div>
      ) : !page.projects.length ? (
        <div className="card card-pad text-sm text-ink-3">{t('projects.empty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {page.projects.map(p => (
            <li key={p.id}>
              <Link href={`/projects/${p.id}`} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
                <FolderKanban className="h-4 w-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{p.name}</span>
                <span className={`pill ${HEALTH_TONE[p.health]} w-20 shrink-0 justify-center`}>{healthLabels[p.health]}</span>
                <span className="pill pill-neutral w-24 shrink-0 justify-center">{statusLabels[p.status]}</span>
                <span className="hidden w-28 shrink-0 md:block"><span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${HEALTH_BAR[p.health]}`} style={{ width: `${p.progress}%` }} /></span></span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-3">{p.progress}%</span>
                <span className="hidden w-28 shrink-0 truncate text-xs text-ink-3 lg:block">{p.owner?.name || t('projects.noOwner')}</span>
                <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{p.deadline ?? t('projects.noDeadline')}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {drawerOpen && (
        <ProjectDrawer options={page.options} onCloseHref="/projects"
          labels={{
            newProject: t('projects.newProject'), editProject: t('projects.editProject'),
            name: t('projects.name'), owner: t('projects.owner'), department: t('projects.department'), status: t('projects.status'),
            startDate: t('projects.startDate'), deadline: t('projects.deadline'), budget: t('projects.budget'),
            description: t('projects.description'), notes: t('projects.notes'),
            noOwner: t('projects.noOwner'), noDepartment: t('projects.noDepartment'),
            save: t('projects.save'), saving: t('projects.saving'), cancel: t('projects.cancel'), create: t('projects.create'),
            close: t('common.close'), saveFailed: t('projects.saveFailed'),
            statusLabels, advanced: t('tasks.advanced'),
          }} />
      )}
    </div>
  );
}
