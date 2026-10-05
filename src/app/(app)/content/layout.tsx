import { Anton, Manrope, Space_Mono } from 'next/font/google';

const anton = Anton({ subsets: ['latin'], weight: '400', variable: '--font-ct-display', display: 'swap' });
const manrope = Manrope({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800'], variable: '--font-ct-body', display: 'swap' });
const spaceMono = Space_Mono({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-ct-mono', display: 'swap' });

/**
 * Scopes the Content module's dark/gold restyle (Lucas's artifact-based redesign,
 * later extended past "visual skin only" to the pillars/status-collapse schema change
 * in migration 0012 — see content/page.tsx's doc comment and docs/ARCHITECTURE.md) to
 * just this route segment. Two things happen here and nowhere else in the app:
 *
 * 1. Three Google Fonts load via `next/font/google` (self-hosted at build time, same
 *    mechanism the root layout already uses for Noto Sans TC — no external font
 *    request at runtime, no new CSP/allowlist concerns). They're declared here, not in
 *    the root `app/layout.tsx`, specifically so every other module keeps shipping only
 *    Geist Sans/Mono + Noto Sans TC — adding ~3 more font files to every page in the
 *    app for a restyle that only one screen uses would be a real, avoidable regression.
 * 2. The `.content-theme` wrapper class (defined in `src/styles/globals.css`, scoped
 *    entirely under that one class name) is applied around `children`. It carries its
 *    own CSS custom properties — dark surface tokens, the pillar swatch palette — and
 *    never touches the shared `:root` tokens the rest of the app's `.card`/
 *    `.btn-*`/`.pill-*`/`.input` classes read from. Content is the only screen in
 *    DAYSTAR OS that looks like this on purpose; Sidebar/TopBar stay exactly as they
 *    are since this layout only wraps the page content, not the app shell above it.
 */
export default function ContentLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`content-theme ${anton.variable} ${manrope.variable} ${spaceMono.variable}`}>
      {children}
    </div>
  );
}
