// UI text in Korean (the source) and English. Components call `t(key, vars)`;
// the App re-renders on a language change, so a module-level locale is
// enough (no context needed). Placeholders look like `{name}`; a Korean
// particle that depends on the value goes after a colon (see `josa`).

import { en } from "./en";
import { type Key, ko } from "./ko";

export type { Key };
export type Locale = "ko" | "en";
/** Stored preference: follow the OS or force a language. */
export type LanguagePref = Locale | "system";

const DICTS: Record<Locale, Record<Key, string>> = { ko, en };
let current: Locale = "ko";

const systemLocale = (): Locale =>
  typeof navigator !== "undefined" && !navigator.language?.toLowerCase().startsWith("ko") ? "en" : "ko";

export const resolveLocale = (pref: LanguagePref): Locale => (pref === "system" ? systemLocale() : pref);

export function setLocale(locale: Locale) {
  current = locale;
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

export const getLocale = () => current;

/** BCP 47 tag for `toLocaleString` and friends. */
export const localeTag = () => (current === "ko" ? "ko-KR" : "en-US");

// Particle pairs: [after a final consonant, after a vowel].
const PAIRS: [string, string][] = [
  ["을", "를"],
  ["이", "가"],
  ["은", "는"],
  ["과", "와"],
  ["으로", "로"],
];
// How digits are read: 영 일 이 삼 사 오 육 칠 팔 구 (2: final ㄹ, 1: other final consonant, 0: none).
const DIGIT = [1, 2, 0, 1, 0, 0, 1, 2, 2, 0];

/**
 * The final sound of how `word` is read in Korean: 0 vowel, 1 final consonant, 2 final ㄹ.
 * Hangul reads its last syllable, digits their Korean names (1 일, 3 삼). An
 * uppercase letter ends an acronym and is read by its name: L 엘 and R 알 end
 * in ㄹ, M 엠 and N 엔 in a consonant (PR → 피알). A lowercase letter ends a word
 * read in English, and only the endings that keep a final consonant in Korean
 * spelling count: m, n, ng (main → 메인), l as ㄹ (pull → 풀), and t, p, k right
 * after a vowel or ck (rocket → 로켓, stack → 스택); anything else (master, test,
 * fix, hex SHAs) reads as a vowel. Trailing punctuation is skipped.
 */
export function finalSound(word: string): 0 | 1 | 2 {
  const w = word.replace(/[^0-9A-Za-z가-힣]+$/, "");
  const c = w.at(-1);
  if (!c) return 0;
  const code = c.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) {
    const jong = (code - 0xac00) % 28;
    return jong === 0 ? 0 : jong === 8 ? 2 : 1;
  }
  if (c >= "0" && c <= "9") return DIGIT[code - 48] as 0 | 1 | 2;
  if (c >= "A" && c <= "Z") return c === "L" || c === "R" ? 2 : c === "M" || c === "N" ? 1 : 0;
  return c === "l" ? 2 : /(?:[mn]|ng|ck|[aeiou][tpk])$/.test(w) ? 1 : 0;
}

/** The particle (either form of 을/를, 이/가, 은/는, 과/와, 으로/로) that fits after `word`. */
export function josa(word: string, particle: string): string {
  const pair = PAIRS.find((p) => p.includes(particle));
  if (!pair) return particle;
  const sound = finalSound(word);
  // 으로 drops its 으 after ㄹ as well as after a vowel.
  return sound === 0 || (sound === 2 && pair[0] === "으로") ? pair[1] : pair[0];
}

/** The English noun form that fits a count: `forms` is "singular|plural". */
export function plural(count: string, forms: string): string {
  const [one, many] = forms.split("|");
  return Number(count) === 1 ? one : many;
}

/**
 * Fill `{name}` placeholders. `{name:을}` adds the particle that fits the value;
 * `{:을}` adds only the particle, for the placeholder before it, when markup or
 * quotes sit between (`<b>{name}</b>{:을}`). A suffix with a bar is an English
 * plural instead: `{n:commit|commits}` gives "1 commit" or "2 commits", and
 * `{:is|are}` only the word, for the count before it.
 */
export function fill(text: string, vars: Record<string, string | number>): string {
  let last = "";
  const suffix = (s: string) => (s.includes("|") ? plural(last, s) : josa(last, s));
  return text.replace(/\{(\w*)(?::([^}]+))?\}/g, (m, k: string, particle?: string) => {
    if (!k) return particle ? suffix(particle) : m;
    if (!(k in vars)) return m;
    last = String(vars[k]);
    if (!particle) return last;
    return particle.includes("|") ? `${last} ${plural(last, particle)}` : last + josa(last, particle);
  });
}

export function t(key: Key, vars?: Record<string, string | number>): string {
  const text = DICTS[current][key] ?? ko[key];
  return vars ? fill(text, vars) : text;
}

/** Narrows dynamic keys such as `progress.${phase}` that may be missing. */
export const isKey = (key: string): key is Key => key in ko;
