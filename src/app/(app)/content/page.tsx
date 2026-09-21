import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import type { Role } from '@/lib/permissions';
import { getContentPage } from '@/lib/data/content';
import { CONTENT_TYPE, CONTENT_PLATFORM, CONTENT_STATUS, type ContentStatus } from '@/lib/content/constants';
import { ContentDrawer } from '@/components/content/ContentDrawer';
import { ContentStatusControl, EditContentLink, DeleteContentButton } from '@/components/content/ContentActions';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const PACE_TONE = { ahead: 'pill-ok', on_pace: 'pill-ok', behind: 'pill-bad' } as const;

/**
 * CONTENT (spec §07 Content engine) — "Are we producing, what works?"
 *
 * A flat list sorted by pipeline stage, not the full drag-drop kanban / calendar the
 * spec describes (see ARCHITECTURE §0 for the scope note), plus the same weekly
 * publishing-pace figure the Command Center's "Content this week" card links here
 * from. `content_select` RLS: every active org member. Creating is open to any
 * member (`content_insert`); editing is manager-or-above or whoever owns/created a
 * piece (`content_update` — mirrored by `canEditContent` in lib/permissions.ts);
 * deleting is manager-or-above only, no owner exception (`content_delete`).
 */
export default async function ContentPage({ searchParams }: { searchParams: Promise<Search> }) {
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

  const page = await getContentPage(m.organization_id, role, user.id, locale);

  const statusFilter = (CONTENT_STATUS as readonly string[]).includes(first(sp.status) ?? '') ? (first(sp.status) as ContentStatus) : undefined;
  const items = statusFilter ? page.items.filter(c => c.status === statusFilter) : page.items;

  const editId = first(sp.edit);
  const editing = editId ? page.items.find(c => c.id === editId && c.canEdit) : undefined;
  const drawerOpen = first(sp.new) === '1' || !!editing;

  const typeLabels = Object.fromEntries(CONTENT_TYPE.map(x => [x, t(`content.type_.${x}`)])) as Record<(typeof CONTENT_TYPE)[number], string>;
  const platformLabels = Object.fromEntries(CONTENT_PLATFORM.map(x => [x, t(`content.platform_.${x}`)])) as Record<(typeof CONTENT_PLATFORM)[number], string>;
  const statusLabels = Object.fromEntries(CONTENT_STATUS.map(x => [x, t(`content.status_.${x}`)])) as Record<(typeof CONTENT_STATUS)[number], string>;
  const actionsLabels = { edit: t('common.edit'), delete: t('content.delete'), deleteConfirm: t('content.deleteConfirm'), saveFailed: t('content.saveFailed'), statusLabels };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <h1>{t('content.heading')}</h1>
        <Link href="?new=1" scroll={false} className="btn-primary"><Plus className="h-4 w-4" />{t('content.newContent')}</Link>
      </header>

      <div className="card card-pad space-y-2">
        <div className="label">{t('content.weeklyPace')}</div>
        {page.pacing.target === null ? (
          <p className="text-sm text-ink-3">{t('content.noTarget')}</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="text-2xl font-semibold tabular-nums">{page.pacing.publishedThisWeek}<span className="text-base font-normal text-ink-3"> / {page.pacing.target}</span></span>
            {page.pacing.pacing && <span className={`pill ${PACE_TONE[page.pacing.pacing.status]}`}>{t(`common.status.${page.pacing.pacing.status}`)}</span>}
            <span className="text-xs text-ink-3">{t('content.weeklyPaceHint')}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Link href="/content" scroll={false} className={`pill ${!statusFilter ? 'pill-ok' : 'pill-neutral'}`}>{t('common.all')}</Link>
        {CONTENT_STATUS.map(s => (
          <Link key={s} href={`?status=${s}`} scroll={false} className={`pill ${statusFilter === s ? 'pill-ok' : 'pill-neutral'}`}>{statusLabels[s]}</Link>
        ))}
      </div>

      {page.error ? (
        <div className="card card-pad text-sm text-bad">{t('content.loadFailed')}</div>
      ) : !items.length ? (
        <div className="card card-pad text-sm text-ink-3">{statusFilter ? t('content.emptyFiltered') : t('content.empty')}</div>
      ) : (
        <ul className="card divide-y divide-border">
          {items.map(c => (
            <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
              <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{c.title}</span>
              <span className="hidden w-24 shrink-0 truncate text-xs text-ink-3 md:block">{typeLabels[c.type]}</span>
              <span className="hidden w-20 shrink-0 truncate text-xs text-ink-3 lg:block">{platformLabels[c.platform]}</span>
              <span className="hidden w-24 shrink-0 truncate text-xs text-ink-3 lg:block">{c.owner?.name ?? t('content.noOwner')}</span>
              <span className="w-20 shrink-0 text-right text-xs tabular-nums text-ink-3">{c.publishDate ?? c.shootDate ?? '—'}</span>
              <ContentStatusControl id={c.id} status={c.status} canEdit={c.canEdit} labels={actionsLabels} />
              <EditContentLink id={c.id} canEdit={c.canEdit} labels={actionsLabels} />
              <DeleteContentButton id={c.id} canDelete={c.canDelete} labels={actionsLabels} />
            </li>
          ))}
        </ul>
      )}

      {drawerOpen && (
        <ContentDrawer options={page.options} onCloseHref="/content"
          content={editing ? {
            id: editing.id, title: editing.title, type: editing.type, platform: editing.platform, status: editing.status,
            ownerId: editing.owner?.id ?? '', productId: editing.product?.id ?? '', campaignId: editing.campaign?.id ?? '',
            talent: editing.talent ?? '', concept: editing.concept ?? '', hook: editing.hook ?? '',
            shootDate: editing.shootDate ?? '', publishDate: editing.publishDate ?? '', url: editing.url ?? '', notes: editing.notes ?? '',
          } : undefined}
          labels={{
            newContent: t('content.newContent'), editContent: t('content.editContent'),
            title: t('content.title'), type: t('content.type'), platform: t('content.platform'), owner: t('common.owner'), product: t('content.product'),
            status: t('content.status'), talent: t('content.talent'), concept: t('content.concept'), hook: t('content.hook'),
            shootDate: t('content.shootDate'), publishDate: t('content.publishDate'), url: t('content.url'), notes: t('content.notes'),
            noOwner: t('content.noOwner'), noProduct: t('content.noProduct'), campaign: t('content.campaign'), noCampaign: t('content.noCampaign'),
            save: t('content.save'), saving: t('content.saving'), cancel: t('content.cancel'), create: t('content.create'),
            close: t('common.close'), saveFailed: t('content.saveFailed'),
            typeLabels, platformLabels, statusLabels, advanced: t('tasks.advanced'),
          }} />
      )}
    </div>
  );
}
