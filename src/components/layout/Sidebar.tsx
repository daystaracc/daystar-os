'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NAV_GROUPS as GROUPS } from '@/lib/nav';
import type { Role } from '@/lib/permissions';
import type { Dictionary } from '@/lib/i18n';

export function Sidebar({ role, nav }: { role: Role; nav: Dictionary['nav'] }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  let n = 0;
  return (
    <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-bg transition-[width] duration-base md:flex ${collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'}`}>
      <div className="flex h-14 items-center justify-between px-4">
        <Link href="/overview" className="flex items-center gap-2 font-semibold tracking-tight"><span className="grid h-6 w-6 place-items-center rounded-sm bg-ink text-xs text-white">日</span>{!collapsed && <span>DAYSTAR OS</span>}</Link>
        <button onClick={() => setCollapsed(c => !c)} aria-label={collapsed ? nav.expand : nav.collapse} className="btn-ghost h-8 w-8 px-0 text-ink-3">{collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}</button>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-2 pb-6 pt-2" aria-label="Main">
        {GROUPS.map(g => {
          const items = g.items.filter(i => !i.roles || i.roles.includes(role));
          if (!items.length) return null;
          return (
            <div key={g.key}>
              {!collapsed && <div className="label mb-1.5 px-2">{nav.groups[g.key]}</div>}
              <ul className="space-y-0.5">
                {items.map(item => {
                  n += 1; const active = pathname.startsWith(item.href); const Icon = item.icon;
                  return (
                    <li key={item.key}>
                      <Link href={item.href} aria-current={active ? 'page' : undefined} title={collapsed ? String(nav[item.key]) : undefined}
                        className={`flex h-9 items-center gap-2.5 rounded-md px-2 text-sm transition-colors duration-fast ${active ? 'bg-surface font-medium text-ink shadow-card' : 'text-ink-2 hover:bg-muted hover:text-ink'}`}>
                        <Icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <><span className="w-5 text-[11px] tabular-nums text-ink-3">{String(n).padStart(2, '0')}</span><span className="truncate">{nav[item.key]}</span></>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
