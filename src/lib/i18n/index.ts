/**
 * Tiny i18n layer: dictionaries are plain objects; `t()` resolves "a.b.c" keys and
 * interpolates {param}. Supports a minimal plural form: {n, plural, =0 {…} other {…}}.
 * Locale is stored in a cookie ("locale") and on the profile; the switch is in the top bar.
 */
import { en } from './en';

export type Locale = 'zh-Hant' | 'en';
export const LOCALES: Locale[] = ['zh-Hant', 'en'];
export const DEFAULT_LOCALE: Locale = 'zh-Hant';

/** Recursively widens the literal types of `en` so zh-Hant can be typed as the same shape. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dictionary = Widen<typeof en>;

/** All dotted keys of the dictionary — gives autocomplete + compile-time checking to t(). */
type Paths<T, P extends string = ''> = { [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`> }[keyof T & string];
export type TKey = Paths<typeof en>;

const dictionaries: Record<Locale, () => Promise<Dictionary>> = {
  en: async () => en as Dictionary,
  'zh-Hant': async () => (await import('./zh-Hant')).zhHant,
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  return dictionaries[locale]();
}

function lookup(dict: Dictionary, key: string): string | undefined {
  return key.split('.').reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict) as string | undefined;
}

export function interpolate(template: string, params: Record<string, string | number> = {}): string {
  // {n, plural, =0 {zero} other {other}}
  let out = template.replace(/\{(\w+),\s*plural,\s*([^}]*\{[^}]*\}\s*)+\}/g, (m, name: string) => {
    const n = Number(params[name] ?? 0);
    const exact = new RegExp(`=${n}\\s*\\{([^}]*)\\}`).exec(m);
    const other = /other\s*\{([^}]*)\}/.exec(m);
    const branch = exact ? exact[1] : other ? other[1] : '';
    // ICU's "#" stands for the number the plural is about.
    return branch.replace(/#/g, n.toLocaleString('en-US'));
  });
  out = out.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    return v === undefined ? `{${name}}` : typeof v === 'number' ? v.toLocaleString('en-US') : String(v);
  });
  return out;
}

/** Bound translator for a locale. Falls back to English, then to the key itself. */
export function makeT(dict: Dictionary, fallback: Dictionary = en as Dictionary) {
  return (key: TKey, params?: Record<string, string | number>): string => {
    const raw = lookup(dict, key) ?? lookup(fallback, key) ?? key;
    return interpolate(raw, params);
  };
}
export type T = ReturnType<typeof makeT>;

export function greetingKey(hour: number): TKey {
  return hour < 12 ? 'cc.greeting.morning' : hour < 18 ? 'cc.greeting.afternoon' : 'cc.greeting.evening';
}

export { localizedField, type Bilingual } from './localize';
