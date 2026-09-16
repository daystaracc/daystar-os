'use server';

import { createClient } from '@/lib/supabase/server';

export type SearchResultType = 'task' | 'project' | 'goal' | 'product' | 'content' | 'sop';

export interface SearchResult {
  type: SearchResultType;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
}

/**
 * Global search (⌘K), across the entity tables that have their own title/name field
 * and a real detail destination to send the user to. Deliberately not every table —
 * Revenue/Finance/Marketing/CRM rows don't have a single human-readable title worth
 * matching against, and searching them would mean building a bespoke result renderer
 * for each. Six types covers what people actually go looking for: tasks, projects,
 * goals, products, content pieces, SOPs.
 *
 * No app-level role gate here — every table below is selected through the user's own
 * Supabase client, so RLS (the generic-loop `*_select` policies, all "any active
 * member of the org") is what actually decides what comes back. A member who can't
 * see Finance still can't see it through search either, because there's nothing
 * Finance-shaped being searched — but if a table's RLS is ever tightened, this
 * function inherits that automatically rather than needing its own copy of the rule.
 */
export async function globalSearchEntities(query: string): Promise<SearchResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return [];

  // Escape ilike's own wildcard characters so a literal "%" or "_" in the query
  // is matched literally, not treated as a pattern.
  const like = `%${q.replace(/[%_]/g, m => `\\${m}`)}%`;
  const LIMIT = 5;

  const [tasks, projects, goals, products, content, sops] = await Promise.all([
    sb.from('tasks').select('id, title, status').ilike('title', like).order('updated_at', { ascending: false }).limit(LIMIT),
    sb.from('projects').select('id, name, status').ilike('name', like).order('updated_at', { ascending: false }).limit(LIMIT),
    sb.from('goals').select('id, title, level').ilike('title', like).order('updated_at', { ascending: false }).limit(LIMIT),
    sb.from('products').select('id, name, sku').ilike('name', like).order('updated_at', { ascending: false }).limit(LIMIT),
    sb.from('content').select('id, title, status').ilike('title', like).order('updated_at', { ascending: false }).limit(LIMIT),
    sb.from('sops').select('id, title, category').ilike('title', like).order('updated_at', { ascending: false }).limit(LIMIT),
  ]);

  const results: SearchResult[] = [];
  for (const t of tasks.data ?? []) results.push({ type: 'task', id: t.id, title: t.title, subtitle: t.status, href: `/tasks?task=${t.id}` });
  for (const p of projects.data ?? []) results.push({ type: 'project', id: p.id, title: p.name, subtitle: p.status, href: `/projects/${p.id}` });
  for (const g of goals.data ?? []) results.push({ type: 'goal', id: g.id, title: g.title, subtitle: g.level, href: `/goals/${g.id}` });
  for (const pr of products.data ?? []) results.push({ type: 'product', id: pr.id, title: pr.name, subtitle: pr.sku, href: `/products/${pr.id}` });
  for (const c of content.data ?? []) results.push({ type: 'content', id: c.id, title: c.title, subtitle: c.status, href: `/content?edit=${c.id}` });
  for (const s of sops.data ?? []) results.push({ type: 'sop', id: s.id, title: s.title, subtitle: s.category, href: `/sops/${s.id}` });

  return results;
}
