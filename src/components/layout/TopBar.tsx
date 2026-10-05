'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, Plus, Bell, ChevronDown } from 'lucide-react';
import { LocaleSwitch } from './LocaleSwitch';
import type { Dictionary, Locale } from '@/lib/i18n';
import { signOut } from '@/app/(auth)/login/actions';

/**
 * Top bar: global search (⌘K), quick create, notifications, date, profile, language switch.
 *
 * `today` is computed server-side (in `(app)/layout.tsx`, from the same server `Date`
 * every other request-scoped value comes from) and passed in as a plain string — NOT
 * computed here with `new Date()`. This file is a client component, so a `new Date()`
 * called directly in its body runs twice: once during SSR (server clock/timezone) and
 * again during hydration (browser clock/timezone, Taipei for every real user here,
 * UTC+8 ahead of Vercel's server). That guaranteed drift was throwing a React #418
 * hydration-mismatch error on literally every page load, since this top bar sits in
 * the shared app shell — found 2026-10-01 via the browser console on live traffic,
 * not something a type check or a code read would have caught. Taking `today` as a
 * prop removes the client-side recomputation entirely, so there is nothing left to
 * mismatch.
 */
export function TopBar({ locale, labels, appLabels, user, today, unreadCount = 0 }: { locale: Locale; labels: Dictionary['topbar']; appLabels: Dictionary['app']; user: { name: string; avatarUrl?: string | null }; today: string; unreadCount?: number }) {
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.dispatchEvent(new CustomEvent('daystar:open-search')); } };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);

  const quick: [keyof Dictionary['topbar']['create'], string][] = [['task', '/tasks?new=1'], ['project', '/projects?new=1'], ['revenue', '/revenue?new=1'], ['product', '/products?new=1'], ['inventory', '/inventory?adjust=1'], ['content', '/content?new=1'], ['campaign', '/marketing?new=1'], ['note', '/reviews?note=1']];

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-bg/85 px-6 backdrop-blur lg:px-10">
      {/* min-w-0 + flex-1: with a fixed `w-full` the search and the actions together
          exceed a phone's width and push the whole page into horizontal scroll. */}
      <button onClick={() => document.dispatchEvent(new CustomEvent('daystar:open-search'))} className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-ink-3 hover:border-border-strong sm:max-w-md">
        <Search className="h-4 w-4 shrink-0" /><span className="flex-1 truncate text-left">{labels.search}</span><kbd className="hidden shrink-0 rounded-sm bg-muted px-1.5 text-[11px] sm:inline">{labels.searchHint}</kbd>
      </button>
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <div className="relative">
          <button onClick={() => setCreateOpen(o => !o)} className="btn-primary h-8 px-2.5 text-xs" aria-haspopup="menu" aria-expanded={createOpen} aria-label={labels.quickCreate}><Plus className="h-4 w-4" /><span className="hidden sm:inline">{labels.quickCreate}</span></button>
          {createOpen && (
            <ul role="menu" className="absolute right-0 mt-1 w-56 rounded-md bg-surface p-1 shadow-pop animate-fade-up" onMouseLeave={() => setCreateOpen(false)}>
              {quick.map(([k, href]) => <li key={k}><Link role="menuitem" href={href} className="block rounded-sm px-2.5 py-1.5 text-sm hover:bg-muted" onClick={() => setCreateOpen(false)}>{labels.create[k]}</Link></li>)}
            </ul>
          )}
        </div>
        <Link href="/notifications" aria-label={labels.notifications} className="btn-ghost relative h-8 w-8 px-0">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Link>
        <span className="hidden px-2 text-xs tabular-nums text-ink-3 md:inline">{today}</span>
        <LocaleSwitch locale={locale} switchTo={appLabels.switchTo.replace('{lang}', locale === 'en' ? appLabels.chinese : appLabels.english)} />
        <form action={signOut}>
          <button className="btn-ghost h-8 gap-1.5 px-2 text-sm" title={labels.signOut}>
            <span className="grid h-6 w-6 place-items-center rounded-full bg-brand-brown text-[11px] font-semibold text-white">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="hidden md:inline">{user.name}</span><ChevronDown className="hidden h-3.5 w-3.5 text-ink-3 sm:block" />
          </button>
        </form>
      </div>
      <span className="sr-only">{appLabels.name}</span>
    </header>
  );
}
