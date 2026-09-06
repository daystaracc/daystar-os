/** Number formatting used everywhere in DAYSTAR OS. Locale-aware where it matters. */
export type Locale = 'zh-Hant' | 'en';

/** NT$742,400 — full precision, for tables and detail pages. */
export function formatTWD(value: number, locale: Locale = 'zh-Hant'): string {
  const n = Math.round(value);
  return `NT$${n.toLocaleString(locale === 'en' ? 'en-US' : 'zh-Hant-TW')}`;
}

/** NT$742.4K / NT$1.08M — for KPI headlines. zh-Hant uses 萬 / 億. */
export function formatTWDCompact(value: number, locale: Locale = 'zh-Hant'): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (locale === 'zh-Hant') {
    if (abs >= 1e8) return `${sign}NT$${trim(abs / 1e8, 2)} 億`;
    if (abs >= 1e4) return `${sign}NT$${trim(abs / 1e4, abs >= 1e6 ? 0 : 1)} 萬`;
    return `${sign}NT$${Math.round(abs).toLocaleString('zh-Hant-TW')}`;
  }
  if (abs >= 1e6) return `${sign}NT$${trim(abs / 1e6, 2)}M`;
  if (abs >= 1e3) return `${sign}NT$${trim(abs / 1e3, 1)}K`;
  return `${sign}NT$${Math.round(abs)}`;
}

/** 74.2% */
export function formatPercent(value: number, digits = 1): string {
  return `${trim(value, digits)}%`;
}

/** ↑ 12.4% / ↓ 4.2% / — */
export function formatDelta(pct: number | null, digits = 1): string {
  if (pct === null || Number.isNaN(pct)) return '—';
  if (Math.abs(pct) < 0.05) return '0%';
  return `${pct > 0 ? '↑' : '↓'} ${trim(Math.abs(pct), digits)}%`;
}

/** Percentage change from previous to current; null when previous is 0/undefined. */
export function pctChange(current: number, previous: number | null | undefined): number | null {
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}

export function trim(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return digits > 0 ? s.replace(/\.?0+$/, '') : s;
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
