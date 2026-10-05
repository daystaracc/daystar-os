import type { PillarColor } from '@/lib/content/constants';

/**
 * Maps a pillar's stored `color` key to the CSS custom property that actually holds
 * its hex value (defined under `.content-theme` in src/styles/globals.css — see the
 * `--ct-pillar-*` block there). Shared by every place a pillar's color shows up
 * (ContentCalendar, ContentBoard, the pillar filter/legend chip row, and the "Manage
 * pillars" swatch picker in ContentDrawer) — unlike the old 8-stage `STATUS_VAR` maps
 * those components used to duplicate, this one has more than two consumers, so a
 * single shared source is worth the import instead of copy-pasting an 8-entry map
 * four times.
 */
export const PILLAR_VAR: Record<PillarColor, string> = {
  gold: 'var(--ct-pillar-gold)', rose: 'var(--ct-pillar-rose)', sage: 'var(--ct-pillar-sage)', sky: 'var(--ct-pillar-sky)',
  violet: 'var(--ct-pillar-violet)', bronze: 'var(--ct-pillar-bronze)', ember: 'var(--ct-pillar-ember)', slate: 'var(--ct-pillar-slate)',
};

/** Border/dot color for a piece with no pillar assigned — a neutral hairline, not a fake 9th pillar color. */
export const NO_PILLAR_VAR = 'var(--ct-hairline-strong)';
