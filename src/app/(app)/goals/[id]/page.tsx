import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getGoalDetail, getGoalOptions } from '@/lib/data/goals';
import { GOAL_LEVEL, GOAL_STATUS, OBJECTIVE_PERIOD, KR_UNIT, KR_DIRECTION } from '@/lib/goals/constants';
import { GoalDrawer } from '@/components/goals/GoalDrawer';
import { GoalActions } from '@/components/goals/GoalActions';
import { GoalObjectives } from '@/components/goals/GoalObjectives';
import { ObjectiveDrawer } from '@/components/goals/ObjectiveDrawer';
import { KeyResultDrawer } from '@/components/goals/KeyResultDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE = { on_track: 'pill-ok', completed: 'pill-ok', at_risk: 'pill-warn', off_track: 'pill-bad', draft: 'pill-neutral' } as const;

export default async function GoalDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Search> }) {
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

  const goal = await getGoalDetail(m.organization_id, id, role, locale);
  if (!goal) notFound();

  const canManage = role === 'founder' || role === 'manager';
  const editGoalOpen = first(sp.edit) === '1' && goal.canEdit;
  const newObjectiveOpen = first(sp.newObjective) === '1' && canManage;
  const editObjectiveId = canManage ? first(sp.editObjective) : undefined;
  const editingObjective = editObjectiveId ? goal.objectives.find(o => o.id === editObjectiveId) : undefined;
  const newKrObjectiveId = canManage ? first(sp.newKr) : undefined;
  const editKrId = canManage ? first(sp.editKr) : undefined;
  const editingKr = editKrId ? goal.objectives.flatMap(o => o.keyResults.map(k => ({ ...k, objectiveId: o.id }))).find(k => k.id === editKrId) : undefined;

  const statusLabels = Object.fromEntries(GOAL_STATUS.map(s => [s, t(`common.status.${s}`)])) as Record<(typeof GOAL_STATUS)[number], string>;
  const levelLabels = Object.fromEntries(GOAL_LEVEL.map(l => [l, t(`goals.level_.${l}`)])) as Record<(typeof GOAL_LEVEL)[number], string>;
  const periodLabels = Object.fromEntries(OBJECTIVE_PERIOD.map(p => [p, t(`goals.period.${p}`)])) as Record<(typeof OBJECTIVE_PERIOD)[number], string>;
  const unitLabels = Object.fromEntries(KR_UNIT.map(u => [u, t(`goals.unit_.${u}`)])) as Record<(typeof KR_UNIT)[number], string>;
  const directionLabels = Object.fromEntries(KR_DIRECTION.map(d => [d, t(`goals.direction_.${d}`)])) as Record<(typeof KR_DIRECTION)[number], string>;

  // Options for the edit drawers only need to be loaded when a manager/founder can use them.
  const options = canManage ? await getGoalOptions(m.organization_id) : { people: [] };

  const objectivesLabels = {
    objectives: t('goals.objectives'), newObjective: t('goals.newObjective'), objectivesEmpty: t('goals.objectivesEmpty'),
    keyResults: t('goals.keyResults'), newKeyResult: t('goals.newKeyResult'), keyResultsEmpty: t('goals.keyResultsEmpty'),
    updateProgress: t('goals.updateProgress'), updateProgressLabel: t('goals.updateProgressLabel'), noOwner: t('goals.noOwner'),
    edit: t('common.edit'), deleteObjective: t('goals.deleteObjective'), deleteObjectiveConfirm: t('goals.deleteObjectiveConfirm'),
    deleteKeyResult: t('goals.deleteKeyResult'), deleteKeyResultConfirm: t('goals.deleteKeyResultConfirm'),
    saveFailed: t('goals.saveFailed'), noProgress: t('goals.noProgress'),
    statusLabels,
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <Link href="/goals" className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" />{t('goals.backToGoals')}</Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate">{goal.title}</h1>
            <span className={`pill ${STATUS_TONE[goal.status]}`}>{statusLabels[goal.status]}</span>
            <span className="pill pill-neutral">{levelLabels[goal.level]}</span>
          </div>
          {goal.description && <p className="mt-2 max-w-2xl text-sm text-ink-2">{goal.description}</p>}
        </div>
        <GoalActions goalId={goal.id} canEdit={goal.canEdit} canDelete={goal.canDelete}
          labels={{ edit: t('common.edit'), delete: t('goals.delete'), deleteConfirm: t('goals.deleteConfirm'), deleteFailed: t('goals.deleteFailed') }} />
      </header>

      <div className="card card-pad space-y-4">
        <div className="flex items-center justify-between text-sm">
          <span className="label">{t('goals.objectives')}</span>
          <span className="tabular-nums">{goal.progress === null ? t('goals.noProgress') : `${goal.progress}%`} · {goal.objectiveCount}</span>
        </div>
        {goal.progress !== null && (
          <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-accent" style={{ width: `${goal.progress}%` }} /></span>
        )}
        <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3">
          <Stat label={t('goals.owner')} value={goal.owner?.name || t('goals.noOwner')} />
          <Stat label={t('goals.startDate')} value={goal.startDate ?? t('goals.noStartDate')} />
          <Stat label={t('goals.endDate')} value={goal.endDate ?? t('goals.noEndDate')} />
        </dl>
      </div>

      <GoalObjectives goalId={goal.id} objectives={goal.objectives} canManage={canManage} canDelete={goal.canDelete} labels={objectivesLabels} />

      {editGoalOpen && (
        <GoalDrawer options={options} onCloseHref={`/goals/${goal.id}`}
          goal={{
            id: goal.id, title: goal.title, level: goal.level, status: goal.status,
            ownerId: goal.owner?.id ?? '', startDate: goal.startDate ?? '', endDate: goal.endDate ?? '', description: goal.description ?? '',
          }}
          labels={{
            newGoal: t('goals.newGoal'), editGoal: t('goals.editGoal'),
            title: t('goals.title'), level: t('goals.level'), status: t('goals.status'), owner: t('goals.owner'),
            startDate: t('goals.startDate'), endDate: t('goals.endDate'), description: t('goals.description'), noOwner: t('goals.noOwner'),
            save: t('goals.save'), saving: t('goals.saving'), cancel: t('goals.cancel'), create: t('goals.create'),
            close: t('common.close'), saveFailed: t('goals.saveFailed'),
            levelLabels, statusLabels,
          }} />
      )}

      {(newObjectiveOpen || editingObjective) && (
        <ObjectiveDrawer goalId={goal.id} options={options} onCloseHref={`/goals/${goal.id}`}
          objective={editingObjective && {
            id: editingObjective.id, title: editingObjective.title, periodType: editingObjective.periodType, status: editingObjective.status,
            ownerId: editingObjective.owner?.id ?? '', startDate: editingObjective.startDate ?? '', endDate: editingObjective.endDate ?? '',
          }}
          labels={{
            newObjective: t('goals.newObjective'), editObjective: t('goals.editObjective'),
            title: t('goals.title'), periodType: t('goals.periodType'), status: t('goals.status'), owner: t('goals.owner'),
            startDate: t('goals.startDate'), endDate: t('goals.endDate'), noOwner: t('goals.noOwner'),
            save: t('goals.save'), saving: t('goals.saving'), cancel: t('goals.cancel'), create: t('goals.create'),
            close: t('common.close'), saveFailed: t('goals.saveFailed'),
            periodLabels, statusLabels,
          }} />
      )}

      {(newKrObjectiveId || editingKr) && (
        <KeyResultDrawer objectiveId={editingKr?.objectiveId ?? newKrObjectiveId!} goalId={goal.id} options={options} onCloseHref={`/goals/${goal.id}`}
          keyResult={editingKr && {
            id: editingKr.id, title: editingKr.title, unit: editingKr.unit, direction: editingKr.direction,
            startValue: String(editingKr.startValue), currentValue: String(editingKr.currentValue), targetValue: String(editingKr.targetValue),
            deadline: editingKr.deadline ?? '', ownerId: editingKr.owner?.id ?? '', notes: editingKr.notes ?? '',
          }}
          labels={{
            newKeyResult: t('goals.newKeyResult'), editKeyResult: t('goals.editKeyResult'),
            title: t('goals.title'), unit: t('goals.unit'), direction: t('goals.direction'),
            startValue: t('goals.startValue'), currentValue: t('goals.currentValue'), targetValue: t('goals.targetValue'),
            deadline: t('goals.deadline'), owner: t('goals.owner'), notes: t('goals.notes'), noOwner: t('goals.noOwner'),
            save: t('goals.save'), saving: t('goals.saving'), cancel: t('goals.cancel'), create: t('goals.create'),
            close: t('common.close'), saveFailed: t('goals.saveFailed'),
            unitLabels, directionLabels,
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
