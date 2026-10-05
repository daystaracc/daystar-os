import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Plus, LayoutList, CalendarDays, KanbanSquare } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { getContentPage } from '@/lib/data/content';
import { CONTENT_TYPE, CONTENT_PLATFORM, CONTENT_STATUS, PILLAR_COLOR, type ContentStatus } from '@/lib/content/constants';
import { ContentDrawer } from '@/components/content/ContentDrawer';
import { ContentStatusControl, EditContentLink, DeleteContentButton } from '@/components/content/ContentActions';
import { ContentCalendar } from '@/components/content/ContentCalendar';
import { ContentBoard } from '@/components/content/ContentBoard';
import { PillarManager } from '@/components/content/PillarManager';
import { PILLAR_VAR } from '@/components/content/pillarColors';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const PACE_TONE = { ahead: 'ct-pill-ok', on_pace: 'ct-pill-ok', behind: 'ct-pill-bad' } as const;
const CONTENT_VIEWS = ['list', 'calendar', 'kanban'] as const;
type ContentView = (typeof CONTENT_VIEWS)[number];
const VIEW_ICON = { list: LayoutList, calendar: CalendarDays, kanban: KanbanSquare } as const;

/**
 * CONTENT (spec §07 Content engine) — "Are we producing, what works?"
 *
 * Three views over the same `getContentPage()` data: List (flat, sorted by pipeline
 * stage — the original build), Calendar (by `publishDate`, undated pieces listed
 * below the grid) and Kanban (by status, drag-and-drop with a <select> fallback —
 * mirrors TaskBoard.tsx/TaskCalendar.tsx). The active view, and for Calendar the
 * displayed month, are both URL state (`?view=`, `?month=`) — same principle as
 * Tasks (see tasks/page.tsx) — so `getContentPage` itself stays view-agnostic and
 * unchanged; only this page and the two new view components are new. Plus the same
 * weekly publishing-pace figure the Command Center's "Content this week" card links
 * here from. `content_select` RLS: every active org member. Creating is open to any
 * member (`content_insert`); editing is manager-or-above or whoever owns/created a
 * piece (`content_update` — mirrored by `canEditContent` in lib/permissions.ts);
 * deleting is manager-or-above only, no owner exception (`content_delete`).
 *
 * VISUAL SKIN (2026-10-02): everything on this page and in ContentCalendar/ContentBoard/
 * ContentActions/ContentDrawer below it renders inside `.content-theme` (applied once,
 * in `content/layout.tsx`) — a dark/gold restyle Lucas asked for after seeing a
 * standalone artifact prototype. No other module's classes (`.card`/`.btn-*`/
 * `.pill-*`/`.input`) were touched; this file only uses their `.ct-*` equivalents,
 * defined in `src/styles/globals.css` scoped under `.content-theme`.
 *
 * SCHEMA CHANGE (2026-10-02, migration 0012): the first ask was "just restyle" (visual
 * only, 8-stage status untouched). Lucas then explicitly asked to go further — "make
 * it exactly like the artifact" — which meant two real data-model changes, not just
 * CSS: `content.status` collapsed from 8 stages to idea/planned/shot/posted (see
 * lib/content/constants.ts's CONTENT_STATUS comment and the migration file's header),
 * and a new `pillars` table became the main categorization axis, ahead of
 * content_type/platform. Status is now purely "where is this in production" (shown as
 * a glyph, STATUS_GLYPH) while pillar is "what kind of content is this" (shown as a
 * color, via PillarManager.tsx's swatches) — two orthogonal axes that used to be
 * conflated into one 8-value status enum. A pillar filter row (all views) sits above
 * the existing status filter (List only, unchanged in kind) for the same reason the
 * two are now separate fields: filtering by pillar makes sense everywhere; filtering by
 * production stage only ever made sense in the flat List view.
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

  const view = (CONTENT_VIEWS as readonly string[]).includes(first(sp.view) ?? '') ? (first(sp.view) as ContentView) : 'list';
  const asOfToday = new Date().toISOString().slice(0, 10);
  const month = view === 'calendar' ? (first(sp.month)?.match(/^\d{4}-\d{2}$/) ? first(sp.month)! : asOfToday.slice(0, 7)) : undefined;

  const statusFilter = (CONTENT_STATUS as readonly string[]).includes(first(sp.status) ?? '') ? (first(sp.status) as ContentStatus) : undefined;
  // Pillar filter (added 2026-10-02, migration 0012) applies across every view, unlike
  // the status filter above which is List-only — see this file's doc comment.
  const pillarFilter = page.options.pillars.some(p => p.id === first(sp.pillar)) ? first(sp.pillar) : undefined;
  const byPillar = (list: typeof page.items) => (pillarFilter ? list.filter(c => c.pillar?.id === pillarFilter) : list);
  const items = byPillar(statusFilter ? page.items.filter(c => c.status === statusFilter) : page.items);

  const editId = first(sp.edit);
  const editing = editId ? page.items.find(c => c.id === editId && c.canEdit) : undefined;
  const drawerOpen = first(sp.new) === '1' || !!editing;
  // Calendar/Kanban aren't URL-filterable like List, so the drawer's close link and the
  // header's "new" link carry `view`/`month` explicitly to stay on the same view — List
  // keeps its exact original hrefs (`/content`, `?new=1`), unchanged.
  const closeHref = view === 'calendar' ? `/content?view=calendar&month=${month}` : view === 'kanban' ? '/content?view=kanban' : '/content';
  const newHref = view === 'calendar' ? `?view=calendar&month=${month}&new=1` : view === 'kanban' ? '?view=kanban&new=1' : '?new=1';

  /**
   * Builds a filter/view link that carries forward whichever of status/pillar/month
   * isn't being changed by this particular link — e.g. clicking a pillar chip while a
   * status filter and a specific view are active keeps both. `status` is dropped
   * whenever `targetView` isn't `'list'` (there's no status filter chip row outside
   * List — see the doc comment above), the same as the view switcher already did
   * before pillar filtering existed.
   */
  function hrefFor(targetView: ContentView, overrides: { status?: ContentStatus | null; pillar?: string | null } = {}) {
    const params = new URLSearchParams();
    if (targetView !== 'list') params.set('view', targetView);
    if (targetView === 'calendar') params.set('month', month ?? asOfToday.slice(0, 7));
    const status = overrides.status !== undefined ? overrides.status : targetView === 'list' ? statusFilter : null;
    const pillar = overrides.pillar !== undefined ? overrides.pillar : pillarFilter;
    if (status) params.set('status', status);
    if (pillar) params.set('pillar', pillar);
    const qs = params.toString();
    return qs ? `/content?${qs}` : '/content';
  }

  const typeLabels = Object.fromEntries(CONTENT_TYPE.map(x => [x, t(`content.type_.${x}`)])) as Record<(typeof CONTENT_TYPE)[number], string>;
  const platformLabels = Object.fromEntries(CONTENT_PLATFORM.map(x => [x, t(`content.platform_.${x}`)])) as Record<(typeof CONTENT_PLATFORM)[number], string>;
  const statusLabels = Object.fromEntries(CONTENT_STATUS.map(x => [x, t(`content.status_.${x}`)])) as Record<(typeof CONTENT_STATUS)[number], string>;
  const colorLabels = Object.fromEntries(PILLAR_COLOR.map(x => [x, t(`content.color_.${x}`)])) as Record<(typeof PILLAR_COLOR)[number], string>;
  const actionsLabels = { edit: t('common.edit'), delete: t('content.delete'), deleteConfirm: t('content.deleteConfirm'), saveFailed: t('content.saveFailed'), statusLabels };
  const viewLabel: Record<ContentView, string> = { list: t('tasks.list'), calendar: t('tasks.calendar'), kanban: t('tasks.kanban') };

  return (
    <div className="space-y-6 animate-fade-up">
      <header className="flex items-baseline justify-between">
        <div className="space-y-1">
          <div className="ct-eyebrow">
            <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 L20 8 L12 22 L4 8 Z" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
            DAYSTAR · CONTENT OPS
          </div>
          <h1>{t('content.heading')}</h1>
        </div>
        <Link href={newHref} scroll={false} className="ct-btn ct-btn-primary"><Plus className="h-4 w-4" />{t('content.newContent')}</Link>
      </header>

      <div className="ct-card ct-card-pad space-y-2">
        <div className="ct-label">{t('content.weeklyPace')}</div>
        {page.pacing.target === null ? (
          <p className="text-sm ct-muted">{t('content.noTarget')}</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-3">
            <span className="ct-mono text-2xl font-semibold tabular-nums">{page.pacing.publishedThisWeek}<span className="text-base font-normal ct-muted"> / {page.pacing.target}</span></span>
            {page.pacing.pacing && <span className={`ct-pill ${PACE_TONE[page.pacing.pacing.status]}`}>{t(`common.status.${page.pacing.pacing.status}`)}</span>}
            <span className="text-xs ct-muted-2">{t('content.weeklyPaceHint')}</span>
          </div>
        )}
      </div>

      {/* Pillar filter + "Manage pillars" — all views (pillar is the main categorization
          axis now; see this file's SCHEMA CHANGE doc comment above). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Link href={hrefFor(view, { pillar: null })} scroll={false} className="ct-chip" aria-current={!pillarFilter}>{t('content.allPillars')}</Link>
          {page.options.pillars.map(p => (
            <Link key={p.id} href={hrefFor(view, { pillar: p.id })} scroll={false} className="ct-chip" aria-current={pillarFilter === p.id}>
              <span className="ct-dot" style={{ background: PILLAR_VAR[p.color] }} />
              {p.name}
            </Link>
          ))}
        </div>
        <PillarManager pillars={page.options.pillars} canManage={can.managePillars(role)} canDelete={role === 'founder'}
          labels={{
            managePillars: t('content.managePillars'), newPillar: t('content.newPillar'), editPillar: t('content.editPillar'),
            pillarName: t('content.pillarName'), pillarColor: t('content.pillarColor'), savePillar: t('content.savePillar'),
            cancel: t('content.cancel'), create: t('content.create'), close: t('common.close'),
            deletePillar: t('content.deletePillar'), deletePillarConfirm: t('content.deletePillarConfirm'),
            pillarsEmpty: t('content.pillarsEmpty'), pillarSaveFailed: t('content.pillarSaveFailed'), colorLabels,
          }} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {view === 'list' && (
          <div className="flex flex-wrap gap-1.5">
            <Link href={hrefFor('list', { status: null })} scroll={false} className="ct-chip" aria-current={!statusFilter}>{t('common.all')}</Link>
            {CONTENT_STATUS.map(s => (
              <Link key={s} href={hrefFor('list', { status: s })} scroll={false} className="ct-chip" aria-current={statusFilter === s}>{statusLabels[s]}</Link>
            ))}
          </div>
        )}
        {/* view switcher — same icon-toggle pattern as Tasks' layout switcher (TasksToolbar.tsx) */}
        <div role="tablist" aria-label={viewLabel.list} className="ml-auto flex items-center gap-0.5 ct-segmented p-0.5">
          {CONTENT_VIEWS.map(v => {
            const Icon = VIEW_ICON[v];
            return (
              <Link key={v} href={hrefFor(v)} role="tab" title={viewLabel[v]} aria-label={viewLabel[v]} aria-selected={view === v} scroll={false}
                className="h-7 w-7 ct-tab">
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
        </div>
      </div>

      {page.error ? (
        <div className="ct-card ct-card-pad text-sm ct-text-bad">{t('content.loadFailed')}</div>
      ) : view === 'kanban' ? (
        <ContentBoard items={byPillar(page.items)} actionsLabels={actionsLabels}
          labels={{ typeLabels, platformLabels, noOwner: t('content.noOwner'), empty: t('content.empty') }} />
      ) : view === 'calendar' ? (
        <ContentCalendar items={byPillar(page.items)} month={month!} asOf={asOfToday} locale={locale}
          labels={{
            calendarPrev: t('tasks.calendarPrev'), calendarToday: t('tasks.calendarToday'), calendarNext: t('tasks.calendarNext'),
            noPublishDate: t('content.noPublishDate'), noOwner: t('content.noOwner'),
          }} />
      ) : !items.length ? (
        <div className="ct-card ct-card-pad text-sm ct-muted">{statusFilter ? t('content.emptyFiltered') : t('content.empty')}</div>
      ) : (
        <ul className="ct-card ct-divide-y">
          {items.map(c => (
            <li key={c.id} className="ct-row-hover flex flex-wrap items-center gap-3 px-4 py-3 sm:flex-nowrap sm:gap-4">
              <span className="min-w-0 flex-1 basis-full truncate text-sm font-medium sm:basis-auto">{c.title}</span>
              <span className="hidden w-24 shrink-0 truncate text-xs ct-muted md:block">{typeLabels[c.type]}</span>
              <span className="hidden w-20 shrink-0 truncate text-xs ct-muted lg:block">{platformLabels[c.platform]}</span>
              <span className="hidden w-24 shrink-0 truncate text-xs ct-muted lg:block">{c.owner?.name ?? t('content.noOwner')}</span>
              <span className="ct-mono w-20 shrink-0 text-right text-xs tabular-nums ct-muted">{c.publishDate ?? c.shootDate ?? '—'}</span>
              <ContentStatusControl id={c.id} status={c.status} canEdit={c.canEdit} labels={actionsLabels} />
              <EditContentLink id={c.id} canEdit={c.canEdit} labels={actionsLabels} />
              <DeleteContentButton id={c.id} canDelete={c.canDelete} labels={actionsLabels} />
            </li>
          ))}
        </ul>
      )}

      {drawerOpen && (
        <ContentDrawer options={page.options} onCloseHref={closeHref}
          content={editing ? {
            id: editing.id, title: editing.title, type: editing.type, platform: editing.platform, status: editing.status,
            ownerId: editing.owner?.id ?? '', productId: editing.product?.id ?? '', campaignId: editing.campaign?.id ?? '', pillarId: editing.pillar?.id ?? '',
            talent: editing.talent ?? '', concept: editing.concept ?? '', hook: editing.hook ?? '',
            shootDate: editing.shootDate ?? '', publishDate: editing.publishDate ?? '', url: editing.url ?? '', notes: editing.notes ?? '',
          } : undefined}
          labels={{
            newContent: t('content.newContent'), editContent: t('content.editContent'),
            title: t('content.title'), type: t('content.type'), platform: t('content.platform'), owner: t('common.owner'), product: t('content.product'),
            status: t('content.status'), talent: t('content.talent'), concept: t('content.concept'), hook: t('content.hook'),
            shootDate: t('content.shootDate'), publishDate: t('content.publishDate'), url: t('content.url'), notes: t('content.notes'),
            noOwner: t('content.noOwner'), noProduct: t('content.noProduct'), campaign: t('content.campaign'), noCampaign: t('content.noCampaign'),
            pillar: t('content.pillar'), noPillar: t('content.noPillar'),
            save: t('content.save'), saving: t('content.saving'), cancel: t('content.cancel'), create: t('content.create'),
            close: t('common.close'), saveFailed: t('content.saveFailed'),
            typeLabels, platformLabels, statusLabels, advanced: t('tasks.advanced'),
          }} />
      )}
    </div>
  );
}
