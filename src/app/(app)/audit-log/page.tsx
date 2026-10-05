import { redirect } from 'next/navigation';
import Link from 'next/link';
import { History } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { can, type Role } from '@/lib/permissions';
import { getActivityLog, AUDIT_LOG_ENTITY_TYPES, type AuditLogEntityType } from '@/lib/data/auditLog';

export const dynamic = 'force-dynamic';

type Search = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Audit Log (`/audit-log`) — Phase 6 "Intelligence" item, the one still marked "next"
 * in docs/ARCHITECTURE.md §9 until this page. Read-only: a chronological feed over
 * `activity_logs`, gated by `can.viewAuditLog` (mirrors `activity_logs_select` RLS
 * exactly — see permissions.ts). No write path exists or is added here; rows arrive
 * only via the `log_activity()` trigger and the handful of direct cron/sync inserts
 * documented in lib/data/auditLog.ts.
 *
 * Plain server-rendered pagination and entity-type filtering via `<Link href>` —
 * same shape as Content's `hrefFor` — rather than a client component, since nothing
 * on this screen needs interactivity beyond navigating to a different page/filter.
 */
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  if (!can.viewAuditLog(role)) redirect('/my-work');
  const { t, locale } = await getT(profile?.locale);
  const entityTypeLabels = Object.fromEntries(AUDIT_LOG_ENTITY_TYPES.map(x => [x, t(`auditLog.entityTypes.${x}`)])) as Record<AuditLogEntityType, string>;

  const entityType = (AUDIT_LOG_ENTITY_TYPES as readonly string[]).includes(first(sp.type) ?? '')
    ? (first(sp.type) as AuditLogEntityType)
    : undefined;
  const pageNum = Math.max(1, Math.floor(Number(first(sp.page)) || 1));

  const data = await getActivityLog({ page: pageNum, entityType });

  const hrefFor = (overrides: { type?: string; page?: number }) => {
    const params = new URLSearchParams();
    const nextType = overrides.type !== undefined ? overrides.type : entityType;
    const nextPage = overrides.page !== undefined ? overrides.page : data.page;
    if (nextType) params.set('type', nextType);
    if (nextPage > 1) params.set('page', String(nextPage));
    const qs = params.toString();
    return qs ? `/audit-log?${qs}` : '/audit-log';
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'zh-TW', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-muted text-ink-2"><History className="h-4 w-4" /></span>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t('auditLog.title')}</h1>
          <p className="mt-0.5 text-sm text-ink-2">{t('auditLog.subtitle')}</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-1.5">
        <Link href={hrefFor({ type: '', page: 1 })}
          className={`rounded-full px-2.5 py-1 text-xs ${!entityType ? 'bg-ink text-white' : 'bg-muted text-ink-2 hover:text-ink'}`}>
          {t('auditLog.allTypes')}
        </Link>
        {AUDIT_LOG_ENTITY_TYPES.map(type => (
          <Link key={type} href={hrefFor({ type, page: 1 })}
            className={`rounded-full px-2.5 py-1 text-xs ${entityType === type ? 'bg-ink text-white' : 'bg-muted text-ink-2 hover:text-ink'}`}>
            {entityTypeLabels[type]}
          </Link>
        ))}
      </div>

      {data.error ? (
        <div className="card card-pad text-sm text-ink-2">{t('auditLog.loadFailed')}</div>
      ) : data.items.length === 0 ? (
        <div className="card card-pad py-10 text-center text-sm text-ink-3">{t('auditLog.empty')}</div>
      ) : (
        <div className="card">
          <ul className="divide-y divide-border">
            {data.items.map(row => (
              <li key={row.id} className="flex items-start gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm leading-snug text-ink">{row.summary}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-3">
                    <span className="rounded-full bg-muted px-2 py-0.5">{entityTypeLabels[row.entityType as AuditLogEntityType] ?? row.entityType}</span>
                    <span>{row.actor ?? t('auditLog.system')}</span>
                    <span className="tabular-nums">{fmt(row.createdAt)}</span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-ink-2">
          <span>{t('auditLog.total', { n: data.total })}</span>
          <div className="flex items-center gap-3">
            {data.page > 1
              ? <Link href={hrefFor({ page: data.page - 1 })} className="text-ink-2 hover:text-ink">{t('auditLog.prev')}</Link>
              : <span className="text-ink-3">{t('auditLog.prev')}</span>}
            <span className="tabular-nums text-ink-3">{t('auditLog.pageOf', { page: data.page, pageCount: data.pageCount })}</span>
            {data.page < data.pageCount
              ? <Link href={hrefFor({ page: data.page + 1 })} className="text-ink-2 hover:text-ink">{t('auditLog.next')}</Link>
              : <span className="text-ink-3">{t('auditLog.next')}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
