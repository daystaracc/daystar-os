import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, Target } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getGoalsPage } from '@/lib/data/goals';
import { GOAL_LEVEL, GOAL_STATUS } from '@/lib/goals/constants';
import { GoalDrawer } from '@/components/goals/GoalDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE = { on_track: 'pill-ok', completed: 'pill-ok', at_risk: 'pill-warn', off_track: 'pill-bad', draft: 'pill-neutral' } as const;

/**
 * GOALS (spec §02) — "Where are we going, are we on track?" The first link in the
 * chain VISION → GOALS → KPIs → PROJECTS → TASKS.
 *
 * Read access mirrors `goals_select` RLS: every active org member (same generic
 * per-table loop as Projects — see that screen's comment). Write is manager-or-above,
 * delete is founder-only.
 */
export default async function GoalsPage({ searchParams }: { searchParams: Promise<Search> }) {
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

  const page = await getGoalsPage(m.organization_id, role, locale);
  const canManage = role === 'founder' || role === 'manager';
  const drawerOpen = first(sp.new) === '1' && canManage;

  const levelLabels = Object.fromEntries(GOAL_LEVEL.map(l => [l, t(`goals.level_.${l}`)])) as Record<(typeof GOAL_LEVEL)[number], string>;
  const statusLabels = Object.fromEntries(GOAL_STATUS.map(s => [s, t(`common.status.${s}`)])) as Record<(typeof GOAL_STATUS)[number], string>;

  const groups = GOAL_LEVEL.map(level => ({ level, goals: page.goals.filter(g => g.level === level) })).filter(g => g.goals.length > 0);

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('goals.heading')}</h1>
        {canManage && <Link href="?new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('goals.newGoal')}</Link>}
      </header>

      {page.error ? (
        <div className="card card-pad text-sm text-bad">{t('goals.loadFailed')}</div>
      ) : !page.goals.length ? (
        <div className="card card-pad text-sm text-ink-3">{t('goals.empty')}</div>
      ) : (
        <div className="space-y-6">
          {groups.map(({ level, goals }) => (
            <section key={level} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-3">{levelLabels[level]}</h2>
              <ul className="card divide-y divide-border">
                {goals.map(g => (
                  <li key={g.id}>
                    <Link href={`/goals/${g.id}`} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
                      <Target className="h-4 w-4 shrink-0 text-ink-3" />
                      <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{g.title}</span>
                      <span className={`pill ${STATUS_TONE[g.status]} w-24 shrink-0 justify-center`}>{statusLabels[g.status]}</span>
                      <span className="hidden w-28 shrink-0 md:block">
                        {g.progress !== null && (
                          <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-accent" style={{ width: `${g.progress}%` }} /></span>
                        )}
                      </span>
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-ink-3">{g.progress === null ? t('goals.noProgress') : `${g.progress}%`}</span>
                      <span className="hidden w-28 shrink-0 truncate text-xs text-ink-3 lg:block">{g.owner?.name || t('goals.noOwner')}</span>
                      <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{g.endDate ?? t('goals.noEndDate')}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {drawerOpen && (
        <GoalDrawer options={page.options} onCloseHref="/goals"
          labels={{
            newGoal: t('goals.newGoal'), editGoal: t('goals.editGoal'),
            title: t('goals.title'), level: t('goals.level'), status: t('goals.status'), owner: t('goals.owner'),
            startDate: t('goals.startDate'), endDate: t('goals.endDate'), description: t('goals.description'), noOwner: t('goals.noOwner'),
            save: t('goals.save'), saving: t('goals.saving'), cancel: t('goals.cancel'), create: t('goals.create'),
            close: t('common.close'), saveFailed: t('goals.saveFailed'),
            levelLabels, statusLabels,
          }} />
      )}
    </div>
  );
}
