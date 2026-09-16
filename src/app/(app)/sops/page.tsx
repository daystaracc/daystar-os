import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, BookOpen } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getSopsPage } from '@/lib/data/sops';
import { SOP_CATEGORY, SOP_STATUS, type SopCategory } from '@/lib/sops/constants';
import { SopDrawer } from '@/components/sops/SopDrawer';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const STATUS_TONE = { draft: 'pill-neutral', active: 'pill-ok', needs_review: 'pill-warn', archived: 'pill-neutral' } as const;

/**
 * SOPs (spec §15) — "How do we do things?" A document library across the 11 fixed
 * categories from `0001_schema.sql`'s check constraint. `sops_select` RLS: every
 * active org member; create/edit is manager-or-above, delete is founder-only (same
 * generic loop as Products/Goals/Projects — see lib/data/sops.ts).
 */
export default async function SopsPage({ searchParams }: { searchParams: Promise<Search> }) {
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

  const page = await getSopsPage(m.organization_id, role, locale);
  const canManage = role === 'founder' || role === 'manager';
  const drawerOpen = first(sp.new) === '1' && canManage;

  const categoryFilter = (SOP_CATEGORY as readonly string[]).includes(first(sp.category) ?? '') ? (first(sp.category) as SopCategory) : undefined;
  const sops = categoryFilter ? page.sops.filter(s => s.category === categoryFilter) : page.sops;

  const categoryLabels = Object.fromEntries(SOP_CATEGORY.map(x => [x, t(`sops.category_.${x}`)])) as Record<(typeof SOP_CATEGORY)[number], string>;
  const statusLabels = Object.fromEntries(SOP_STATUS.map(x => [x, t(`sops.status_.${x}`)])) as Record<(typeof SOP_STATUS)[number], string>;

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('sops.heading')}</h1>
        {canManage && <Link href="?new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('sops.newSop')}</Link>}
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Link href="/sops" scroll={false} className={`pill ${!categoryFilter ? 'pill-ok' : 'pill-neutral'}`}>{t('common.all')}</Link>
        {SOP_CATEGORY.map(c => (
          <Link key={c} href={`?category=${c}`} scroll={false} className={`pill ${categoryFilter === c ? 'pill-ok' : 'pill-neutral'}`}>{categoryLabels[c]}</Link>
        ))}
      </div>

      {page.error ? (
        <div className="card card-pad text-sm text-bad">{t('sops.loadFailed')}</div>
      ) : !sops.length ? (
        <div className="card card-pad text-sm text-ink-3">{categoryFilter ? t('sops.emptyFiltered') : t('sops.empty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {sops.map(s => (
            <li key={s.id}>
              <Link href={`/sops/${s.id}`} className="row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
                <BookOpen className="h-4 w-4 shrink-0 text-ink-3" />
                <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{s.title}</span>
                <span className="hidden w-32 shrink-0 truncate text-xs text-ink-3 md:block">{categoryLabels[s.category]}</span>
                <span className={`pill ${STATUS_TONE[s.status]} w-24 shrink-0 justify-center`}>{statusLabels[s.status]}</span>
                <span className="hidden w-24 shrink-0 truncate text-xs text-ink-3 lg:block">{s.owner?.name ?? t('sops.noOwner')}</span>
                <span className="w-12 shrink-0 text-right text-xs tabular-nums text-ink-3">v{s.version}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {drawerOpen && (
        <SopDrawer options={page.options} onCloseHref="/sops"
          labels={{
            newSop: t('sops.newSop'), editSop: t('sops.editSop'),
            title: t('sops.title'), category: t('sops.category'), status: t('sops.status'), owner: t('common.owner'), content: t('sops.content'),
            noOwner: t('sops.noOwner'),
            save: t('sops.save'), saving: t('sops.saving'), cancel: t('sops.cancel'), create: t('sops.create'),
            close: t('common.close'), saveFailed: t('sops.saveFailed'),
            categoryLabels, statusLabels,
          }} />
      )}
    </div>
  );
}
