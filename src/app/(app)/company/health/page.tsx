import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Pencil } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getHealthPage } from '@/lib/data/companyHealth';
import { HealthDrawer } from '@/components/health/HealthDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const DOT_TONE = { healthy: 'bg-ok', at_risk: 'bg-warn', critical: 'bg-bad' } as const;
const STATUS_PILL = { healthy: 'pill-ok', at_risk: 'pill-warn', critical: 'pill-bad' } as const;

/**
 * COMPANY HEALTH (spec §11 systems scorecard) — "Which of the 11 systems is the
 * bottleneck, and who owns fixing it?" Reached from the Command Center's "Business
 * health" section (`/company/health#<key>` anchors — see HealthGrid.tsx), which
 * linked here before this page existed.
 *
 * Edit-only: the 11 systems are fixed, seeded rows (`unique (organization_id,
 * key)`), so there's no create/delete UI — see the scope note in
 * lib/data/companyHealth.ts. `business_systems_select` RLS: every active member.
 * `_update`: manager-or-above (same generic loop as Products/Goals/Projects).
 */
export default async function CompanyHealthPage({ searchParams }: { searchParams: Promise<Search> }) {
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

  const page = await getHealthPage(m.organization_id, role, locale);

  const editId = first(sp.edit);
  const editing = editId ? page.systems.find(s => s.id === editId && s.canEdit) : undefined;

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('health.heading')}</h1>
        <span className="text-sm tabular-nums text-ink-3">{t('cc.healthScore')} {page.score.total} / {page.score.max}</span>
      </header>

      {page.error ? (
        <div className="card card-pad text-sm text-bad">{t('health.loadFailed')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {page.systems.map(s => (
            <li key={s.id} id={s.key} className="space-y-2 px-5 py-4 scroll-mt-20">
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{s.name}</span>
                <span className="flex gap-1" aria-label={`${s.score} / 5`}>{[1, 2, 3, 4, 5].map(i => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i <= s.score ? DOT_TONE[s.status] : 'bg-muted'}`} />)}</span>
                <span className={`pill ${STATUS_PILL[s.status]}`}>{t(`common.status.${s.status}`)}</span>
                <span className="hidden w-28 shrink-0 truncate text-xs text-ink-3 md:block">{s.owner?.name ?? t('health.noOwner')}</span>
                {s.canEdit && <Link href={`?edit=${s.id}`} scroll={false} aria-label={t('common.edit')} className="btn-ghost h-7 w-7 shrink-0 px-0"><Pencil className="h-3.5 w-3.5" /></Link>}
              </div>

              {s.nextAction && <p className="text-sm text-ink-2"><span className="text-ink-3">{t('health.nextAction')}: </span>{s.nextAction}</p>}
              {s.bottleneck && <p className="text-sm text-ink-2"><span className="text-ink-3">{t('health.bottleneck')}: </span>{s.bottleneck}</p>}

              <div className="flex flex-wrap items-center gap-4 text-xs text-ink-3">
                <span>{t('health.lastReviewed')}: {s.lastReviewedAt ? new Date(s.lastReviewedAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'zh-TW') : '—'}</span>
                {s.history.length > 1 && (
                  <span className="flex items-center gap-1">
                    {t('health.history')}:
                    {s.history.map((h, i) => <span key={i} className={`h-2 w-2 rounded-full ${h >= 4 ? 'bg-ok' : h >= 2 ? 'bg-warn' : 'bg-bad'}`} title={String(h)} />)}
                  </span>
                )}
              </div>
            </li>
          ))}
          {!page.systems.length && <li className="px-5 py-6 text-sm text-ink-3">{t('health.empty')}</li>}
        </ul>
      )}

      {editing && (
        <HealthDrawer options={page.options} onCloseHref="/company/health"
          system={{
            id: editing.id, name: editing.name, score: editing.score, ownerId: editing.owner?.id ?? '',
            bottleneck: editing.bottleneck ?? '', nextAction: editing.nextAction ?? '',
            futureOwner: editing.futureOwner ?? '', transferDate: editing.transferDate ?? '', goal: editing.goal ?? '',
          }}
          labels={{
            editSystem: t('health.editSystem'), score: t('health.score'), owner: t('health.owner'),
            bottleneck: t('health.bottleneck'), nextAction: t('health.nextAction'),
            futureOwner: t('health.futureOwner'), transferDate: t('health.transferDate'), goal: t('health.goal'),
            noOwner: t('health.noOwner'), save: t('health.save'), saving: t('health.saving'), cancel: t('health.cancel'),
            close: t('common.close'), saveFailed: t('health.saveFailed'), advanced: t('tasks.advanced'),
          }} />
      )}
    </div>
  );
}
