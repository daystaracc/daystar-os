import type { Locale } from './index';

/**
 * Bilingual data columns: the schema pairs a base column with a `_zh` sibling
 * (`products.name` / `products.name_zh`, `sops.title` / `sops.title_zh`, …) that the
 * team fills in when they want a Chinese name.
 */
export type Bilingual<F extends string> = { [K in F | `${F}_zh`]?: string | null };

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The name to display for a row: the `_zh` column when the locale is zh-Hant and that
 * column actually has something in it, otherwise the base column.
 *
 * The fallback is the normal case, not an error path — plenty of rows are deliberately
 * one-language. DAYSTAR's product names are the brand's own names and stay English in
 * both locales, and `tasks` has no `title_zh` column at all; both simply fall through.
 * Empty strings and whitespace-only values count as "not filled in".
 */
export function localizedField<F extends string>(row: Bilingual<F> | null | undefined, field: F, locale: Locale): string {
  const base = text(row?.[field as keyof typeof row]);
  if (locale !== 'zh-Hant') return base;
  const zh = text(row?.[`${field}_zh` as keyof typeof row]).trim();
  return zh || base;
}
