import { LayoutDashboard, Target, FolderKanban, CheckSquare, TrendingUp, Package, Clapperboard, Megaphone, Users, Boxes, Truck, Wallet, UserRound, ClipboardList, BookOpen, Settings, Upload, Briefcase, History } from 'lucide-react';
import type { Role } from '@/lib/permissions';
import type { Dictionary } from '@/lib/i18n';

/** Only the nav keys whose value is a label — excludes the nested `groups` object. */
export type NavLabelKey = { [K in keyof Dictionary['nav']]: Dictionary['nav'][K] extends string ? K : never }[keyof Dictionary['nav']];

export type NavItem = { key: NavLabelKey; href: string; icon: React.ComponentType<{ className?: string }>; roles?: Role[] };
export type NavGroup = { key: keyof Dictionary['nav']['groups']; items: NavItem[] };

/**
 * The single list of every navigable screen — Sidebar renders it as the nav, and
 * CommandPalette (⌘K) searches it. One list so a new screen only has to be added
 * here once to show up in both places.
 */
export const NAV_GROUPS: NavGroup[] = [
  { key: 'command', items: [{ key: 'overview', href: '/overview', icon: LayoutDashboard, roles: ['founder', 'manager'] }, { key: 'myWork', href: '/my-work', icon: Briefcase }] },
  { key: 'plan', items: [{ key: 'goals', href: '/goals', icon: Target }, { key: 'projects', href: '/projects', icon: FolderKanban }, { key: 'tasks', href: '/tasks', icon: CheckSquare }] },
  { key: 'grow', items: [{ key: 'revenue', href: '/revenue', icon: TrendingUp, roles: ['founder', 'manager'] }, { key: 'products', href: '/products', icon: Package }, { key: 'content', href: '/content', icon: Clapperboard }, { key: 'marketing', href: '/marketing', icon: Megaphone, roles: ['founder', 'manager'] }, { key: 'crm', href: '/crm', icon: Users, roles: ['founder'] }] },
  { key: 'operate', items: [{ key: 'inventory', href: '/inventory', icon: Boxes }, { key: 'operations', href: '/operations', icon: Truck }, { key: 'finance', href: '/finance', icon: Wallet, roles: ['founder'] }] },
  { key: 'company', items: [{ key: 'team', href: '/team', icon: UserRound }, { key: 'reviews', href: '/reviews', icon: ClipboardList, roles: ['founder', 'manager'] }, { key: 'sops', href: '/sops', icon: BookOpen }] },
  { key: 'system', items: [
    { key: 'importProducts', href: '/settings/import', icon: Upload, roles: ['founder', 'manager'] },
    { key: 'auditLog', href: '/audit-log', icon: History, roles: ['founder', 'manager'] },
    { key: 'settings', href: '/settings', icon: Settings, roles: ['founder'] },
  ] },
];
