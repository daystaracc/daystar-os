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

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|icons|manifest.webmanifest|api/public).*)'] };
