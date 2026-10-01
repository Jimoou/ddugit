// UI text in Korean (the source) and English. Components call `t(key, vars)`;
// the App re-renders on a language change, so a module-level locale is
// enough (no context needed). Placeholders look like `{name}`.

import { en } from "./en";
import { type Key, ko } from "./ko";

export type { Key };
export type Locale = "ko" | "en";
/** Stored preference: follow the OS or force a language. */
export type LanguagePref = Locale | "system";

const DICTS: Record<Locale, Record<Key, string>> = { ko, en };
let current: Locale = "ko";

export const systemLocale = (): Locale =>
  typeof navigator !== "undefined" && !navigator.language?.toLowerCase().startsWith("ko") ? "en" : "ko";

export const resolveLocale = (pref: LanguagePref): Locale => (pref === "system" ? systemLocale() : pref);

export function setLocale(locale: Locale) {
  current = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

export const getLocale = () => current;

/** BCP 47 tag for `toLocaleString` and friends. */
export const localeTag = () => (current === "ko" ? "ko-KR" : "en-US");

export function t(key: Key, vars?: Record<string, string | number>): string {
  const text = DICTS[current][key] ?? ko[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Narrows dynamic keys such as `progress.${phase}` that may be missing. */
export const isKey = (key: string): key is Key => key in ko;
