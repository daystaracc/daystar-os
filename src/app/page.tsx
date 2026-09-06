import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { homeFor, type Role } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

/** The root sends everyone to their home screen: founders and managers to the Command Center, members to My Work. */
export default async function RootPage() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect('/login');
  const { data: membership } = await sb.from('memberships').select('role').eq('profile_id', user.id).eq('status', 'active').limit(1).single();
  if (!membership) redirect('/no-organization');
  redirect(homeFor(membership.role as Role));
}
