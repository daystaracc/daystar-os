import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import {
  getTasksPage, getTaskDetail, TASK_VIEWS, TASK_LAYOUTS,
  type TaskView, type TaskLayout, type TaskFilters,
} from '@/lib/data/tasks';
import { taskLabels } from '@/components/tasks/labels';
import { TasksToolbar } from '@/components/tasks/TasksToolbar';
import { TaskList, EmptyState, ErrorNote } from '@/components/tasks/TaskList';
import { TaskBoard } from '@/components/tasks/TaskBoard';
import { TaskCalendar } from '@/components/tasks/TaskCalendar';
import { TaskDrawer } from '@/components/tasks/TaskDrawer';
import { TaskPanel } from '@/components/tasks/TaskPanel';
import { STATUS, PRIORITY, type TaskPriority, type TaskStatus } from '@/lib/tasks/constants';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * TASKS — the screen the team opens every day.
 * View (my / today / week / all / overdue), layout (list / kanban / calendar), filters,
 * the open drawer and the open detail panel all live in the URL, so every state is
 * linkable and the filtering happens in Postgres rather than in the browser.
 */
export default async function TasksPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');

  const { t, locale } = await getT(profile?.locale);
  const role = m.role as Role;
  const labels = taskLabels(t, locale);

  const view = (TASK_VIEWS as readonly string[]).includes(first(sp.view) ?? '') ? (first(sp.view) as TaskView) : 'my';
  const layout = (TASK_LAYOUTS as readonly string[]).includes(first(sp.layout) ?? '') ? (first(sp.layout) as TaskLayout) : 'list';
  const asOf = new Date().toISOString().slice(0, 10);
  const month = layout === 'calendar' ? (first(sp.month)?.match(/^\d{4}-\d{2}$/) ? first(sp.month)! : asOf.slice(0, 7)) : undefined;

  const filters: TaskFilters = {
    assignee: first(sp.assignee),
    project: first(sp.project),
    status: (STATUS as readonly string[]).includes(first(sp.status) ?? '') ? (first(sp.status) as TaskStatus) : undefined,
    priority: (PRIORITY as readonly string[]).includes(first(sp.priority) ?? '') ? (first(sp.priority) as TaskPriority) : undefined,
    label: first(sp.label),
  };
  const filtered = Object.values(filters).some(Boolean);

  const page = await getTasksPage(m.organization_id, user.id, role, locale, view, filters, asOf, month);

  const openTaskId = first(sp.task);
  const detail = openTaskId ? await getTaskDetail(m.organization_id, openTaskId, user.id, role, locale) : null;
  const drawerOpen = first(sp.new) === '1';

  const emptyText = filtered ? labels.empty.filtered : labels.empty[view];

  return (
    <div className="space-y-5 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('tasks.heading')}</h1>
        <span className="text-sm tabular-nums text-ink-3">{t('tasks.count', { count: page.tasks.length })}</span>
      </header>

      <TasksToolbar view={view} layout={layout} options={page.options} counts={page.counts} labels={labels} />

      {page.error ? (
        <div className="space-y-3">
          <ErrorNote text={labels.loadFailed} />
          <EmptyState text={labels.loadFailed} action={<Link href="/tasks" className="btn-outline">{labels.retry}</Link>} />
        </div>
      ) : layout === 'kanban' ? (
        <TaskBoard tasks={page.tasks} labels={labels} asOf={asOf} emptyText={emptyText} />
      ) : layout === 'calendar' ? (
        <TaskCalendar tasks={page.tasks} labels={labels} month={month!} asOf={asOf} />
      ) : (
        <TaskList tasks={page.tasks} labels={labels} asOf={asOf} emptyText={emptyText} />
      )}

      {!page.error && !page.tasks.length && !filtered && (
        <div className="flex justify-center">
          <Link href="/tasks?new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{labels.newTask}</Link>
        </div>
      )}

      {drawerOpen && <TaskDrawer options={page.options} labels={labels} task={detail ?? undefined} />}
      {detail && !drawerOpen && <TaskPanel task={detail} labels={labels} />}
    </div>
  );
}
