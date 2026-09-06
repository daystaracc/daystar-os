import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { greetingKey } from '@/lib/i18n';
import { getMyWork } from '@/lib/data/myWork';
import { Section } from '@/components/dashboard/Section';
import { TodayTasks } from '@/components/dashboard/TodayTasks';
import { ProjectHealthList } from '@/components/dashboard/ProjectHealthList';

export const dynamic = 'force-dynamic';

/**
 * MY WORK — the daily screen for everyone, and the home screen for members (spec §7.2).
 * Answers one question: what do *I* need to do today? Overdue first, then today, then upcoming,
 * then the projects the person is on. Checking a box completes the task and spawns any recurrence.
 */
export default async function MyWorkPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('display_name, full_name, locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');

  const { t, locale } = await getT(profile?.locale);
  const data = await getMyWork(m.organization_id, user.id, locale);
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Taipei' }));

  const priorityLabels = { urgent: t('common.priority.urgent'), high: t('common.priority.high'), medium: t('common.priority.medium'), low: t('common.priority.low') };
  const healthLabels = { healthy: t('common.status.healthy'), at_risk: t('common.status.at_risk'), critical: t('common.status.critical') };

  return (
    <div className="space-y-8 animate-fade-up">
      <header>
        <h1 className="text-3xl">{t(greetingKey(hour), { name: profile?.display_name ?? profile?.full_name ?? '' })}</h1>
        <p className="mt-1 text-ink-2">{t('tasks.remaining', { count: data.remaining })}</p>
      </header>

      {data.overdue.length > 0 && (
        <Section title={t('tasks.overdue')} href="/tasks">
          <TodayTasks tasks={data.overdue} priorityLabels={priorityLabels} empty={t('common.empty')} failed={t('tasks.saveFailed')} completeLabel={t('tasks.completeAria')} />
        </Section>
      )}

      <Section title={t('tasks.today')} href="/tasks">
        <TodayTasks tasks={data.today} priorityLabels={priorityLabels} empty={t('tasks.emptyToday')} failed={t('tasks.saveFailed')} completeLabel={t('tasks.completeAria')} />
      </Section>

      <Section title={t('common.upcoming')} href="/tasks">
        <TodayTasks tasks={data.upcoming} priorityLabels={priorityLabels} empty={t('tasks.emptyUpcoming')} failed={t('tasks.saveFailed')} completeLabel={t('tasks.completeAria')} />
      </Section>

      <Section title={t('tasks.myProjects')} href="/projects">
        {data.projects.length
          ? <ProjectHealthList projects={data.projects} healthLabels={healthLabels} />
          : <div className="card px-5 py-8 text-sm text-ink-3">{t('tasks.emptyProjects')}</div>}
      </Section>
    </div>
  );
}
