import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { localizedField, type Locale } from '@/lib/i18n';
import type { Role } from '@/lib/permissions';
import type { SopCategory, SopStatus } from '@/lib/sops/constants';

export interface SopOptions { owners: { id: string; name: string }[] }

export interface SopRow {
  id: string;
  title: string;
  category: SopCategory;
  status: SopStatus;
  owner: { id: string; name: string } | null;
  version: number;
  updatedAt: string;
  /** `sops_update`/`sops_delete` RLS (generic loop, migration 0002): manager-or-above writes, founder-only delete — no per-row owner carve-out, unlike Content. */
  canEdit: boolean;
  canDelete: boolean;
}

export interface SopDetail extends SopRow {
  contentMd: string;
  createdAt: string;
}

export interface SopsPage { sops: SopRow[]; options: SopOptions; error: boolean }

const CATEGORY_ORDER: SopCategory[] = ['fulfillment', 'inventory', 'customer_service', 'content', 'marketing', 'product', 'finance', 'website', 'operations', 'management', 'other'];
const CATEGORY_RANK = Object.fromEntries(CATEGORY_ORDER.map((c, i) => [c, i])) as Record<SopCategory, number>;

// One literal string, not built with `+` — see tasks.ts's SELECT/DETAIL_SELECT note.
const SELECT = 'id, title, title_zh, category, status, owner_id, version, updated_at, owner:owner_id(id, display_name, full_name)';
const DETAIL_SELECT = 'id, title, title_zh, category, status, owner_id, version, updated_at, content_md, created_at, owner:owner_id(id, display_name, full_name)';

export async function getSopOptions(orgId: string): Promise<SopOptions> {
  const sb = await createClient();
  const { data } = await sb.from('memberships').select('profile_id, profiles:profile_id(id, display_name, full_name)').eq('organization_id', orgId).eq('status', 'active');
  return { owners: (data ?? []).map(m => one(m.profiles)).filter(Boolean).map(p => ({ id: p!.id, name: personName(p!) })).sort((a, b) => a.name.localeCompare(b.name)) };
}

/**
 * SOPs (spec §15) — "How do we do things?" A document library: 11 fixed
 * categories, versioned by hand (see the scope note in app/(app)/sops/actions.ts —
 * there's no database trigger for this one, unlike Company Health's score history).
 * `sops_select` RLS: every active org member; write is manager-or-above,
 * delete is founder-only (same generic loop as Products/Goals/Projects).
 */
export async function getSopsPage(orgId: string, role: Role, locale: Locale): Promise<SopsPage> {
  const sb = await createClient();
  const canEdit = role === 'founder' || role === 'manager';

  const [list, options] = await Promise.all([
    sb.from('sops').select(SELECT).eq('organization_id', orgId),
    getSopOptions(orgId),
  ]);
  if (list.error) return { sops: [], options: { owners: [] }, error: true };

  const sops: SopRow[] = (list.data ?? []).map(s => ({
    id: s.id,
    title: localizedField(s, 'title', locale),
    category: s.category as SopCategory,
    status: s.status as SopStatus,
    owner: one(s.owner) ? { id: one(s.owner)!.id, name: personName(one(s.owner)!) } : null,
    version: s.version,
    updatedAt: s.updated_at,
    canEdit,
    canDelete: role === 'founder',
  })).sort((a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || a.title.localeCompare(b.title));

  return { sops, options, error: false };
}

export async function getSopDetail(orgId: string, sopId: string, role: Role, locale: Locale): Promise<SopDetail | null> {
  const sb = await createClient();
  const { data: s } = await sb.from('sops').select(DETAIL_SELECT).eq('organization_id', orgId).eq('id', sopId).maybeSingle();
  if (!s) return null;
  const canEdit = role === 'founder' || role === 'manager';

  return {
    id: s.id,
    title: localizedField(s, 'title', locale),
    category: s.category as SopCategory,
    status: s.status as SopStatus,
    owner: one(s.owner) ? { id: one(s.owner)!.id, name: personName(one(s.owner)!) } : null,
    version: s.version,
    updatedAt: s.updated_at,
    canEdit,
    canDelete: role === 'founder',
    contentMd: s.content_md,
    createdAt: s.created_at,
  };
}

// ---- helpers -------------------------------------------------------------

function one<T>(rel: T | T[] | null | undefined): T | null {
  return (Array.isArray(rel) ? rel[0] : rel) ?? null;
}

function personName(p: { display_name?: string | null; full_name?: string | null }): string {
  return p.display_name || p.full_name || '';
}
