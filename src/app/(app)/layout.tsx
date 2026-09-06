import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getT } from '@/lib/i18n/server';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import type { Role } from '@/lib/permissions';

/** App shell: resolves the signed-in user, their membership (role) and locale once, then renders nav + top bar. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('id, display_name, full_name, avatar_url, locale').eq('id', user.id).single(),
    supabase.from('memberships').select('organization_id, role, organizations(name)').eq('profile_id', user.id).eq('status', 'active').limit(1).single(),
  ]);
  if (!membership) redirect('/no-organization');

  const { locale, dict } = await getT(profile?.locale);
  const role = membership.role as Role;

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} nav={dict.nav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar locale={locale} labels={dict.topbar} appLabels={dict.app} user={{ name: profile?.display_name ?? profile?.full_name ?? '', avatarUrl: profile?.avatar_url }} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 px-6 py-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
