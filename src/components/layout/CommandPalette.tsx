'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import { NAV_GROUPS } from '@/lib/nav';
import { globalSearchEntities, type SearchResult, type SearchResultType } from '@/lib/search/actions';
import type { Dictionary } from '@/lib/i18n';
import type { Role } from '@/lib/permissions';

export interface CommandPaletteLabels {
  placeholder: string; hint: string; navigation: string; results: string;
  searching: string; noResults: string; typeMore: string;
  types: Record<SearchResultType, string>;
}

type Row = { kind: 'nav'; key: string; label: string; href: string; icon: React.ComponentType<{ className?: string }> } | { kind: 'entity'; result: SearchResult };

/**
 * Global search — opened by the top bar's search button/⌘K (both dispatch the
 * `daystar:open-search` DOM event; this component just listens, so either trigger
 * works without them knowing about each other). Two kinds of rows: the sidebar's own
 * nav list (filtered client-side, instant — see lib/nav.ts, the same list Sidebar.tsx
 * renders) and live entity results from `globalSearchEntities` (debounced, since that
 * one hits the database). Nothing about this modifies data — it only ever navigates.
 */
export function CommandPalette({ role, nav, labels }: { role: Role; nav: Dictionary['nav']; labels: CommandPaletteLabels }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [entityResults, setEntityResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const onOpen = () => setOpen(true);
    document.addEventListener('daystar:open-search', onOpen);
    return () => document.removeEventListener('daystar:open-search', onOpen);
  }, []);

  useEffect(() => {
    if (open) { setQuery(''); setEntityResults([]); setActiveIndex(0); requestAnimationFrame(() => inputRef.current?.focus()); }
  }, [open]);

  // Debounced entity search — mirrors the "raw text re-parsed server-side" discipline
  // used elsewhere in this app: the server action re-runs on every keystroke's final
  // value, nothing is cached or trusted from a prior render.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setEntityResults([]); setSearching(false); return; }
    setSearching(true);
    const handle = setTimeout(() => {
      globalSearchEntities(q).then(r => { setEntityResults(r); setSearching(false); }).catch(() => setSearching(false));
    }, 200);
    return () => clearTimeout(handle);
  }, [query]);

  const navRows: Row[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows: Row[] = [];
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        if (item.roles && !item.roles.includes(role)) continue;
        const label = String(nav[item.key]);
        if (q && !label.toLowerCase().includes(q)) continue;
        rows.push({ kind: 'nav', key: item.key, label, href: item.href, icon: item.icon });
      }
    }
    return rows;
  }, [query, role, nav]);

  const entityRows: Row[] = useMemo(() => entityResults.map(r => ({ kind: 'entity', result: r })), [entityResults]);
  const rows = useMemo(() => [...navRows, ...entityRows], [navRows, entityRows]);

  const go = useCallback((row: Row) => {
    setOpen(false);
    router.push(row.kind === 'nav' ? row.href : row.result.href);
  }, [router]);

  useEffect(() => { setActiveIndex(0); }, [rows.length]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, rows.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); const row = rows[activeIndex]; if (row) go(row); }
  };

  if (!open) return null;

  const q = query.trim();
  const showEmpty = q.length >= 2 && !searching && entityRows.length === 0 && navRows.length === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/30 px-4 pt-[12vh]" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-lg bg-surface shadow-pop animate-fade-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-border px-4">
          {searching ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ink-3" /> : <Search className="h-4 w-4 shrink-0 text-ink-3" />}
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={labels.placeholder}
            maxLength={200}
            className="h-12 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-3"
          />
        </div>

        <div className="max-h-[60vh] overflow-y-auto py-2">
          {navRows.length > 0 && (
            <div className="px-2 pb-1">
              {q.length >= 2 && <div className="label px-2 pb-1 pt-1">{labels.navigation}</div>}
              {navRows.map(row => {
                const i = rows.indexOf(row);
                const Icon = row.kind === 'nav' ? row.icon : Search;
                return (
                  <button key={`nav-${row.kind === 'nav' ? row.key : ''}`} onClick={() => go(row)} onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${i === activeIndex ? 'bg-muted text-ink' : 'text-ink-2'}`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{row.kind === 'nav' ? row.label : ''}</span>
                  </button>
                );
              })}
            </div>
          )}

          {entityRows.length > 0 && (
            <div className="px-2 pb-1">
              <div className="label px-2 pb-1 pt-1">{labels.results}</div>
              {entityRows.map(row => {
                const i = rows.indexOf(row);
                const r = row.kind === 'entity' ? row.result : null;
                if (!r) return null;
                return (
                  <button key={`${r.type}-${r.id}`} onClick={() => go(row)} onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm ${i === activeIndex ? 'bg-muted text-ink' : 'text-ink-2'}`}>
                    <span className="shrink-0 rounded-sm bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-3">{labels.types[r.type]}</span>
                    <span className="min-w-0 flex-1 truncate">{r.title}</span>
                    {r.subtitle && <span className="shrink-0 truncate text-xs text-ink-3">{r.subtitle}</span>}
                  </button>
                );
              })}
            </div>
          )}

          {q.length > 0 && q.length < 2 && <p className="px-4 py-6 text-center text-sm text-ink-3">{labels.typeMore}</p>}
          {showEmpty && <p className="px-4 py-6 text-center text-sm text-ink-3">{labels.noResults.replace('{query}', q)}</p>}
        </div>

        <div className="border-t border-border px-4 py-2 text-xs text-ink-3">{labels.hint}</div>
      </div>
    </div>
  );
}
