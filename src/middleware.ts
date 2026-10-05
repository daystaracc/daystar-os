import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/types/database';

/** Refreshes the Supabase session on every request and protects the app routes. */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (all) => {
        all.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        all.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isAuthRoute = path.startsWith('/login') || path.startsWith('/reset-password');
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone(); url.pathname = '/login'; url.searchParams.set('next', path);
    return NextResponse.redirect(url);
  }
  if (user && isAuthRoute) { const url = request.nextUrl.clone(); url.pathname = '/'; url.search = ''; return NextResponse.redirect(url); }
  return response;
}

// api/cron/*, api/internal/*, and api/webhooks/* are server-to-server routes
// authenticated by their own header secret (CRON_SECRET / x-sync-secret / HMAC
// signature) — never by a logged-in Supabase session. Before this exclusion,
// every one of those requests had no `user`, so this middleware redirected it
// to /login (307) before the route handler's own auth check ever ran. Vercel
// logs a 307 as a normal response, so this failed silently: the cron jobs
// never executed, on schedule or via the dashboard's manual "Run" button, and
// nothing in the UI showed an error — it just looked like "Run" did nothing.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|api/public|api/cron|api/internal|api/webhooks).*)'],
};
