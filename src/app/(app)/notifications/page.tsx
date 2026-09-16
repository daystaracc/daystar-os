import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { getNotifications } from '@/lib/data/notifications';
import { NotificationsList } from '@/components/notifications/NotificationsList';

export const dynamic = 'force-dynamic';

/**
 * `/notifications` — the bell icon's destination in `TopBar.tsx`, a dead link until
 * now. No role gate: every active member gets their own notifications, scoped by
 * `notifications_select` RLS (`recipient_id = auth.uid()`) — see the file-level note
 * in lib/data/notifications.ts for why the table is read-only from the app today
 * (nothing populates it yet; that's a separate fan-out/cron concern).
 */
export default async function NotificationsPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await sb.from('profiles').select('locale').eq('id', user.id).single();
  const { t, locale } = await getT(profile?.locale);

  const page = await getNotifications();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t('notifications.title')}</h1>
        <p className="mt-1 text-sm text-ink-2">{t('notifications.subtitle')}</p>
      </header>

      <NotificationsList
        locale={locale}
        items={page.items}
        error={page.error}
        labels={{
          empty: t('notifications.empty'),
          unreadTab: t('notifications.unreadTab'),
          allTab: t('notifications.allTab'),
          markAllRead: t('notifications.markAllRead'),
          markRead: t('notifications.markRead'),
          loadFailed: t('notifications.loadFailed'),
        }}
      />
    </div>
  );
}
