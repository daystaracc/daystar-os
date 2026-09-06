import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { greetingKey } from '@/lib/i18n';
import { getCommandCenter } from '@/lib/data/commandCenter';
import { StatusHeader } from '@/components/dashboard/StatusHeader';
import { RevenueTarget } from '@/components/dashboard/RevenueTarget';
import { AttentionList } from '@/components/dashboard/AttentionList';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PulseGrid } from '@/components/dashboard/PulseGrid';
import { JourneyStrip } from '@/components/dashboard/JourneyStrip';
import { TodayTasks } from '@/components/dashboard/TodayTasks';
import { ProjectHealthList } from '@/components/dashboard/ProjectHealthList';
import { HeroProducts } from '@/components/dashboard/HeroProducts';
import { HealthGrid } from '@/components/dashboard/HealthGrid';
import { Section } from '@/components/dashboard/Section';

export const dynamic = 'force-dynamic';

/**
 * COMMAND CENTER — the most important screen.
 * Order (spec §59): greeting + status → monthly revenue goal → what needs attention → core KPIs → today's pulse
 * → 100M journey → today's tasks / project health → hero products + content → business health → activity.
 * Above the fold: status, revenue target, attention.
 */
export default async function OverviewPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const [{ data: profile }, { data: m }] = await Promise.all([
    sb.from('profiles').select('display_name, full_name, locale').eq('id', user.id).single(),
    sb.from('memberships').select('organization_id, role').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!m) redirect('/no-organization');
  if (m.role === 'member') redirect('/my-work');
  const { t, locale } = await getT(profile?.locale);
  const data = await getCommandCenter(m.organization_id, user.id, locale);
  const hour = Number(new Date().toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: 'Asia/Taipei' }));

  return (
    <div className="space-y-8 animate-fade-up">
      <StatusHeader greeting={t(greetingKey(hour), { name: profile?.display_name ?? profile?.full_name ?? '' })} subtitle={t('cc.subtitle')} status={data.status}
        statusLabel={t('cc.status')} statusText={t(`common.status.${data.status}`)} summary={data.summary.map(s => t(s.code as never, s.params))} />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3"><RevenueTarget data={data.revenue} locale={locale} t={{ title: t('cc.revenueTitle', { month: monthName(data.revenue.month, locale) }), target: t('common.target'), currentPace: t('cc.currentPace'), requiredPace: t('cc.requiredPace'), projected: t('cc.projected'), daysRemaining: t('cc.daysRemaining'), gap: t('cc.gap'), perDay: t('cc.perDay'), status: t(`common.status.${data.revenue.status}`), expected: t('cc.expectedMarker') }} /></div>
        <div className="lg:col-span-2"><AttentionList items={data.attention.map(a => ({ ...a, text: t(`attention.${a.code}` as never, a.params), severityLabel: t(`common.severity.${a.severity}`) }))} labels={{ title: t('cc.attention'), empty: t('cc.attentionEmpty'), view: t('common.view'), resolve: t('common.resolve'), dismiss: t('common.dismiss') }} /></div>
      </div>

      <Section title={t('cc.kpis')}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {data.kpis.map(k => <KpiCard key={k.key} kpi={k} locale={locale} label={t(`kpi.${k.key}` as never)} targetLabel={t('common.target')} momLabel={t('kpi.mom')} />)}
        </div>
      </Section>

      <Section title={t('cc.pulse')}><PulseGrid pulse={data.pulse} locale={locale} labels={{ revenueToday: t('pulse.revenueToday'), ordersToday: t('pulse.ordersToday'), waiting: t('pulse.waiting'), csPending: t('pulse.csPending'), lowStock: t('pulse.lowStock'), tasksDue: t('pulse.tasksDue'), overdue: t('pulse.overdue'), publishing: t('pulse.publishing') }} /></Section>

      <Section title={t('cc.journey')} href="/goals/journey"><JourneyStrip journey={data.journey} locale={locale} labels={{ current: t('journey.current'), runRate: t('journey.runRate'), perMonth: t('journey.perMonth'), perYear: t('journey.perYear'), gap: t('journey.gap') }} /></Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('cc.tasks')} href="/tasks"><TodayTasks tasks={data.tasksToday} priorityLabels={{ urgent: t('common.priority.urgent'), high: t('common.priority.high'), medium: t('common.priority.medium'), low: t('common.priority.low') }} empty={t('tasks.emptyToday')} failed={t('tasks.saveFailed')} completeLabel={t('tasks.completeAria')} /></Section>
        <Section title={t('cc.projects')} href="/projects"><ProjectHealthList projects={data.projects} healthLabels={{ healthy: t('common.status.healthy'), at_risk: t('common.status.at_risk'), critical: t('common.status.critical') }} /></Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t('cc.hero')} href="/products/hero"><HeroProducts products={data.heroProducts} locale={locale} stockLabels={{ critical: t('common.stock.critical'), low: t('common.stock.low'), ok: t('common.stock.ok'), overstock: t('common.stock.overstock'), dead: t('common.stock.dead') }} /></Section>
        <Section title={t('cc.contentWeek')} href="/content">
          <div className="card card-pad grid grid-cols-3 gap-4">
            <div><div className="label">{t('cc.published')}</div><div className="kpi mt-1">{data.contentWeek.published}<span className="text-base text-ink-3"> / {data.contentWeek.target ?? '—'}</span></div></div>
            <div><div className="label">{t('cc.views')}</div><div className="kpi mt-1">{compact(data.contentWeek.views, locale)}</div></div>
            <div><div className="label">{t('cc.top')}</div><div className="mt-1 text-sm font-medium leading-snug">{data.contentWeek.top ? `${data.contentWeek.top.title} · ${compact(data.contentWeek.top.views, locale)}` : '—'}</div></div>
          </div>
        </Section>
      </div>

      <Section title={t('cc.health')} href="/company/health" aside={`${t('cc.healthScore')} ${data.health.total} / ${data.health.max}`}>
        <HealthGrid systems={data.systems.map(s => ({ ...s, label: s.name || t(`health.systems.${s.key}` as never) }))} />
      </Section>

      <Section title={t('cc.activity')} href="/activity">
        <ul className="card divide-y divide-border">
          {data.activity.map(a => <li key={a.id} className="flex items-baseline gap-3 px-5 py-2.5 text-sm"><span className="w-16 shrink-0 text-xs tabular-nums text-ink-3">{new Date(a.at).toLocaleTimeString(locale === 'en' ? 'en-US' : 'zh-TW', { hour: '2-digit', minute: '2-digit' })}</span><span className="text-ink-2">{a.actor ? <b className="font-medium text-ink">{a.actor}</b> : null} {a.summary}</span></li>)}
          {!data.activity.length && <li className="px-5 py-6 text-sm text-ink-3">{t('common.empty')}</li>}
        </ul>
      </Section>
    </div>
  );
}

function monthName(yyyyMm: string, locale: string) {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW', { month: 'long', timeZone: 'UTC' });
}
function compact(n: number, locale: string) { return new Intl.NumberFormat(locale === 'en' ? 'en-US' : 'zh-TW', { notation: 'compact', maximumFractionDigits: 1 }).format(n); }
