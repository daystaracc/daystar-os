import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getProjectDetail, getProjectOptions } from '@/lib/data/projects';
import { PROJECT_STATUS } from '@/lib/projects/constants';
import { ProjectDrawer } from '@/components/projects/ProjectDrawer';
import { ProjectMembers } from '@/components/projects/ProjectMembers';
import { ProjectActions } from '@/components/projects/ProjectActions';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const HEALTH_TONE = { healthy: 'pill-ok', at_risk: 'pill-warn', critical: 'pill-bad' } as const;
const HEALTH_BAR = { healthy: 'bg-ok', at_risk: 'bg-warn', critical: 'bg-bad' } as const;
const PRIORITY_DOT = { urgent: 'bg-bad', high: 'bg-warn', medium: 'bg-ink-3', low: 'bg-ink-3' } as const;

export default async function ProjectDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
  const { id } = await params;
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

  const project = await getProjectDetail(m.organization_id, id, role, locale);
  if (!project) notFound();

  const canManage = role === 'founder' || role === 'manager';
  const editOpen = first(sp.edit) === '1' && project.canEdit;

  const statusLabels = Object.fromEntries(PROJECT_STATUS.map(s => [s, t(`common.status.${s}`)])) as Record<(typeof PROJECT_STATUS)[number], string>;
  const healthLabels = { healthy: t('common.status.healthy'), at_risk: t('common.status.at_risk'), critical: t('common.status.critical') };
  const priorityLabels = { urgent: t('common.priority.urgent'), high: t('common.priority.high'), medium: t('common.priority.medium'), low: t('common.priority.low') };
  // Tasks use a different status vocabulary than projects (backlog/todo/in_progress/blocked/review/done)
  // — a separate map, not a reuse of `statusLabels`, which is keyed by PROJECT_STATUS.
  const taskStatusLabels = { backlog: t('common.status.backlog'), todo: t('common.status.todo'), in_progress: t('common.status.in_progress'), blocked: t('common.status.blocked'), review: t('common.status.review'), done: t('common.status.done') };

  // Options for the edit drawer and the member picker only need to be loaded when they can be used.
  const options = canManage ? await getProjectOptions(m.organization_id, locale) : { people: [], departments: [] };

  return (
    <div className="space-y-6 animate-fade-up">
      <Link href="/projects" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />{t('projects.backToProjects')}</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate">{project.name}</h1>
            <span className={`pill ${HEALTH_TONE[project.health]}`}>{healthLabels[project.health]}</span>
            <span className="pill pill-neutral">{statusLabels[project.status]}</span>
          </div>
          {project.description && <p className="mt-2 max-w-2xl text-sm text-ink-2">{project.description}</p>}
        </div>
        <ProjectActions projectId={project.id} canEdit={project.canEdit} canDelete={project.canDelete}
          labels={{ edit: t('common.edit'), delete: t('projects.delete'), deleteConfirm: t('projects.deleteConfirm'), deleteFailed: t('projects.deleteFailed') }} />
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="card card-pad space-y-4">
            <div className="flex items-center justify-between text-sm">
              <span className="label">{t('projects.progress')}</span>
              <span className="tabular-nums">{project.progress}% · {project.openTasks} / {project.totalTasks}</span>
            </div>
            <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className={`block h-full rounded-full ${HEALTH_BAR[project.health]}`} style={{ width: `${project.progress}%` }} /></span>

            <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
              <Stat label={t('projects.owner')} value={project.owner?.name || t('projects.noOwner')} />
              <Stat label={t('projects.department')} value={project.department?.name || t('projects.noDepartment')} />
              <Stat label={t('projects.deadline')} value={project.deadline ?? t('projects.noDeadline')} />
              <Stat label={t('projects.budget')} value={project.budget !== null ? project.budget.toLocaleString('en-US') : '—'} />
            </dl>

            {project.notes && (
              <div className="border-t border-border pt-4">
                <div className="label mb-1">{t('projects.notes')}</div>
                <p className="whitespace-pre-line text-sm text-ink-2">{project.notes}</p>
              </div>
            )}
          </div>

          <div className="card">
            <div className="flex items-center justify-between px-5 py-3">
              <span className="label">{t('projects.linkedTasks')}</span>
              <Link href={`/tasks?project=${project.id}`} className="text-xs text-ink-3 hover:text-ink">{t('common.seeAll')}</Link>
            </div>
            {project.tasks.length === 0 ? (
              <p className="px-5 pb-4 text-sm text-ink-3">{t('projects.linkedTasksEmpty')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {project.tasks.map(task => (
                  <li key={task.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PRIORITY_DOT[task.priority]}`} aria-hidden />
                    <span className="min-w-0 flex-1 truncate">{task.title}</span>
                    <span className="hidden shrink-0 text-xs text-ink-3 sm:inline">{priorityLabels[task.priority]}</span>
                    <span className="pill pill-neutral shrink-0">{taskStatusLabels[task.status] ?? task.status}</span>
                    <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{task.due_date ?? t('tasks.noDueDate')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <ProjectMembers projectId={project.id} members={project.members} peopleOptions={options.people} canManage={canManage}
          labels={{ members: t('projects.members'), addMember: t('projects.addMember'), removeMember: t('projects.removeMember'), memberNone: t('projects.memberNone'), saveFailed: t('projects.saveFailed') }} />
      </div>

      {editOpen && (
        <ProjectDrawer options={options} onCloseHref={`/projects/${project.id}`}
          project={{
            id: project.id, name: project.name, ownerId: project.owner?.id ?? '', departmentId: project.department?.id ?? '',
            status: project.status, startDate: project.startDate ?? '', deadline: project.deadline ?? '',
            budget: project.budget !== null ? String(project.budget) : '', description: project.description ?? '', notes: project.notes ?? '',
          }}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="label">{label}</dt>
      <dd className="truncate text-sm font-medium">{value}</dd>
    </div>
  );
}
