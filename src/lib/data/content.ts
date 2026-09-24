import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localizedField, type Locale } from '@/lib/i18n';
import { computePacing, weekBounds, type Pacing } from '@/lib/calculations/pacing';
import { canEditContent, type Role } from '@/lib/permissions';
import type { ContentType, ContentPlatform, ContentStatus } from '@/lib/content/constants';

export interface ContentOptions {
  owners: { id: string; name: string }[];
  products: { id: string; name: string }[];
  /** Added 2026-09-16 — `content.campaign_id` has existed in the schema since the
   * original migration, but nothing in the app ever read or wrote it until now (see
   * the doc comment on `getContentPage` below). */
  campaigns: { id: string; name: string }[];
}

export interface ContentRow {
  id: string;
  title: string;
  type: ContentType;
  platform: ContentPlatform;
  owner: { id: string; name: string } | null;
  product: { id: string; name: string } | null;
  /** Added 2026-09-16 — see `getContentPage`'s doc comment. Null just means this
   * piece isn't tied to a paid campaign, same as `product` for organic-only content. */
  campaign: { id: string; name: string } | null;
  status: ContentStatus;
  shootDate: string | null;
  publishDate: string | null;
  // Carried on the list row (not fetched separately) purely so the edit drawer can
  // prefill them — there's no separate detail page for Content (see ARCHITECTURE §0),
  // so the drawer always round-trips whatever the list already has. Leaving any of
  // these out here would make an unrelated edit silently blank the field, since the
  // drawer submits every field on save (same trap `getProductDetail`'s DETAIL_SELECT
  // avoids by existing at all).
  talent: string | null;
  concept: string | null;
  hook: string | null;
  url: string | null;
  notes: string | null;
  /** Sum of every daily `content_metrics.views` row logged for this piece. Metrics logging isn't built yet (see ARCHITECTURE §0), so this is 0 for everything today — never guessed. */
  viewsTotal: number;
  /** Mirrors `content_update` RLS: managers/founders edit anything, others only their own. */
  canEdit: boolean;
  /** `content_delete`: manager-or-above only, no owner carve-out. */
  canDelete: boolean;
}

export interface ContentPacing {
  /** null when no `weekly_content` target row covers this week — "no target set", not zero. */
  target: number | null;
  publishedThisWeek: number;
  pacing: Pacing | null;
}

export interface ContentPage {
  items: ContentRow[];
  pacing: ContentPacing;
  options: ContentOptions;
  error: boolean;
}

const STATUS_RANK: Record<ContentStatus, number> = { idea: 0, script: 1, ready_to_shoot: 2, shot: 3, editing: 4, review: 5, scheduled: 6, published: 7 };

// One literal string, not built with `+` — see tasks.ts's SELECT/DETAIL_SELECT note.
const SELECT = 'id, title, content_type, platform, owner_id, product_id, campaign_id, status, shoot_date, publish_date, talent, concept, hook, url, notes, created_by, owner:owner_id(id, display_name, full_name), products:product_id(id, name, name_zh), campaigns:campaign_id(id, name), content_metrics(views)';

export async function getContentOptions(orgId: string, locale: Locale): Promise<ContentOptions> {
  const sb = await createClient();
  const [{ data: people }, { data: products }, { data: campaigns }] = await Promise.all([
    sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active'),
    sb.from('products').select('id, name, name_zh').eq('organization_id', orgId).order('name'),
    sb.from('campaigns').select('id, name').eq('organization_id', orgId).order('start_date', { ascending: false }),
  ]);
  return {
    owners: (people ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name)),
    products: (products ?? []).map(p => ({ id: p.id, name: localizedField(p, 'name', locale) })),
    campaigns: (campaigns ?? []).map(c => ({ id: c.id, name: c.name })),
  };
}

/**
 * CONTENT (spec §07 Content engine) — "Are we producing, what works?"
 *
 * Returns a flat list, sorted by pipeline stage so unfinished work surfaces before
 * published pieces, plus a weekly publishing-pace card built from the already-tested
 * `computePacing()` / `weekBounds()` in `lib/calculations/pacing.ts` (the same
 * functions Revenue's period switcher uses) — no new pure logic for this screen. This
 * function stays view-agnostic on purpose: content/page.tsx now also renders a
 * Calendar (by `publishDate`) and a drag-drop Kanban (by `status`) over this exact
 * same `items` array — see that file's doc comment — so the flat/sorted shape here is
 * a serialization choice, not a limit on what the UI can do with it.
 *
 * `campaign` (added 2026-09-16): `content.campaign_id` has been in the schema since
 * the original migration (a creator/content piece tied to a specific paid push), but
 * nothing ever read or wrote it — Content and Marketing existed as two disconnected
 * screens despite the schema already linking them. `campaigns` RLS is the generic
 * per-table shape (select = any active member, same as `content_select`), so no
 * member who can already see Content can be blocked from seeing which campaign a
 * piece belongs to. Optional in both create and edit — most content has no paid
 * campaign behind it, same as most content having no `product_id`.
 */
export async function getContentPage(orgId: string, role: Role, userId: string, locale: Locale, asOf = new Date().toISOString().slice(0, 10)): Promise<ContentPage> {
  const sb = await createClient();
  const week = weekBounds(asOf);

  const [list, targets, options] = await Promise.all([
    sb.from('content').select(SELECT).eq('organization_id', orgId),
    sb.from('targets').select('metric, value, period_start, period_end').eq('organization_id', orgId).eq('metric', 'weekly_content').lte('period_start', asOf).gte('period_end', asOf),
    getContentOptions(orgId, locale),
  ]);
  if (list.error) return { items: [], pacing: { target: null, publishedThisWeek: 0, pacing: null }, options, error: true };


  const target = targets.data?.[0] ? Number(targets.data[0].value) : null;
  const publishedThisWeek = (list.data ?? []).filter(c => c.status === 'published' && c.publish_date && c.publish_date >= week.start && c.publish_date <= week.end).length;
  const pacing = target !== null ? computePacing({ target, actual: publishedThisWeek, periodStart: week.start, periodEnd: week.end, asOf }) : null;

  const items: ContentRow[] = (list.data ?? []).map(c => ({
    id: c.id,
    title: c.title,
    type: c.content_type as ContentType,
    platform: c.platform as ContentPlatform,
    owner: one(c.owner) ? { id: one(c.owner)!.id, name: personName(one(c.owner)!) } : null,
    product: one(c.products) ? { id: one(c.products)!.id, name: localizedField(one(c.products)!, 'name', locale) } : null,
    campaign: one(c.campaigns) ? { id: one(c.campaigns)!.id, name: one(c.campaigns)!.name } : null,
    status: c.status as ContentStatus,
    shootDate: c.shoot_date,
    publishDate: c.publish_date,
    talent: c.talent,
    concept: c.concept,
    hook: c.hook,
    url: c.url,
    notes: c.notes,
    viewsTotal: ((c.content_metrics ?? []) as { views: number }[]).reduce((a, m) => a + Number(m.views), 0),
    canEdit: canEditContent({ owner_id: c.owner_id, created_by: c.created_by }, role, userId),
    canDelete: role === 'founder' || role === 'manager',
  })).sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status] || (a.publishDate ?? a.shootDate ?? '9999').localeCompare(b.publishDate ?? b.shootDate ?? '9999'));

  return { items, pacing: { target, publishedThisWeek, pacing }, options, error: false };
}

// ---- helpers -------------------------------------------------------------

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
