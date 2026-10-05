import { afterEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { ko } from "./ko";
import { fill, finalSound, josa, plural, setLocale, t } from ".";

// Particles are Korean only: `{name:을}` counts as `{name}`, and a bare `{:을}` not at all.
const placeholders = (s: string) =>
  [...s.matchAll(/\{(\w+)(?::[^}]+)?\}|<(\w+)>/g)].map((m) => (m[1] ? `{${m[1]}}` : m[0])).sort();

describe("dictionaries", () => {
  it("translate every key with the same placeholders and markup", () => {
    for (const [key, text] of Object.entries(ko)) {
      expect(en[key as keyof typeof ko], key).toBeTruthy();
      expect(placeholders(en[key as keyof typeof ko]), key).toEqual(placeholders(text));
    }
  });
  it("write English plurals as two forms instead of (s)", () => {
    for (const [key, text] of Object.entries(en)) {
      expect(text, key).not.toMatch(/\(s\)/);
      for (const m of text.matchAll(/\{\w*:([^}]*\|[^}]*)\}/g)) expect(m[1].split("|"), key).toHaveLength(2);
    }
  });
  it("use particle placeholders instead of 을(를)-style fallbacks", () => {
    for (const [key, text] of Object.entries(ko)) expect(text, key).not.toMatch(/\((를|을|가|이|는|은|과|와|으)\)/);
  });
});

describe("t", () => {
  afterEach(() => setLocale("ko"));
  it("fills placeholders in the current locale", () => {
    expect(t("graph.run", { n: 5 })).toBe("커밋 5개 · 눌러서 펼치기");
    setLocale("en");
    expect(t("graph.run", { n: 5 })).toBe("5 commits · click to expand");
  });
  it("picks the particle that fits the value", () => {
    expect(t("checkout.done", { name: "main" })).toBe("main으로 이동했어요");
    expect(t("checkout.done", { name: "feature/theme" })).toBe("feature/theme로 이동했어요");
  });
});

describe("josa", () => {
  it("reads Hangul by its last syllable", () => {
    expect(finalSound("브랜치")).toBe(0);
    expect(finalSound("원격")).toBe(1);
    expect(finalSound("파일")).toBe(2);
    expect(josa("원격", "를")).toBe("을");
    expect(josa("브랜치", "을")).toBe("를");
    expect(josa("파일", "으로")).toBe("로");
    expect(josa("원격", "로")).toBe("으로");
  });
  it("reads digits by their Korean names", () => {
    expect(josa("v1.0", "을")).toBe("을"); // 영
    expect(josa("v1.2", "을")).toBe("를"); // 이
    expect(josa("v2.1", "으로")).toBe("로"); // 일 (ㄹ)
    expect(josa("#3", "이")).toBe("이"); // 삼
  });
  it("reads Latin as an English word: m, n, ng, l, ck and t/p/k after a vowel keep a final consonant", () => {
    expect(josa("rocket", "을")).toBe("을");
    expect(josa("feature/stack", "이")).toBe("이");
    expect(josa("Kim Work", "으로")).toBe("로");
    expect(josa("test", "을")).toBe("를");
    expect(josa("main", "을")).toBe("을");
    expect(josa("upstream", "은")).toBe("은");
    expect(josa("testing", "이")).toBe("이");
    expect(josa("pull", "으로")).toBe("로");
    expect(josa("pull", "을")).toBe("을");
    expect(josa("master", "을")).toBe("를");
    expect(josa("hotfix/crash", "과")).toBe("와");
    expect(josa("debug", "이")).toBe("가");
  });
  it("reads a trailing capital as a letter name", () => {
    expect(josa("PR", "을")).toBe("을");
    expect(josa("MR", "으로")).toBe("로");
    expect(josa("PR #12", "이")).toBe("가");
    expect(josa("HTML", "은")).toBe("은");
    expect(josa("LFS", "을")).toBe("를");
  });
  it("skips trailing punctuation and leaves unknown particles alone", () => {
    expect(josa("(main)", "을")).toBe("을");
    expect(josa("", "을")).toBe("를");
    expect(josa("main", "도")).toBe("도");
  });
});

describe("fill", () => {
  it("adds a particle to the value, or after markup for the previous value", () => {
    expect(fill("{name:을} 지워요", { name: "main" })).toBe("main을 지워요");
    expect(fill("<b>{name}</b>{:을} 지워요", { name: "dev" })).toBe("<b>dev</b>를 지워요");
    expect(fill("{a}와 {b:과}", { a: "x", b: "main" })).toBe("x와 main과");
  });
  it("leaves unknown placeholders as they are", () => {
    expect(fill("{other:을} {n}", { n: 1 })).toBe("{other:을} 1");
  });
});

describe("plural", () => {
  it("picks the singular only for exactly one", () => {
    expect(plural("1", "commit|commits")).toBe("commit");
    expect(plural("0", "commit|commits")).toBe("commits");
    expect(plural("12", "branch|branches")).toBe("branches");
  });
  it("fills a count with its noun, or only the noun after markup", () => {
    expect(fill("{n:commit|commits} left", { n: 1 })).toBe("1 commit left");
    expect(fill("{n:commit|commits} left", { n: 3 })).toBe("3 commits left");
    expect(fill("<b>{n}</b> {:repository|repositories}", { n: 1 })).toBe("<b>1</b> repository");
  });
  it("reads singular and plural in English", () => {
    setLocale("en");
    expect(t("graph.run", { n: 1 })).toBe("1 commit · click to expand");
    expect(t("discard.go", { n: 1 })).toBe("Discard 1 file");
    expect(t("discard.go", { n: 2 })).toBe("Discard 2 files");
    setLocale("ko");
  });
});
