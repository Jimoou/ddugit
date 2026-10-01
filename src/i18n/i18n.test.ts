import { afterEach, describe, expect, it } from "vitest";
import { en } from "./en";
import { ko } from "./ko";
import { setLocale, t } from ".";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}|<(\w+)>/g)].map((m) => m[0]).sort();

describe("dictionaries", () => {
  it("translate every key with the same placeholders and markup", () => {
    for (const [key, text] of Object.entries(ko)) {
      expect(en[key as keyof typeof ko], key).toBeTruthy();
      expect(placeholders(en[key as keyof typeof ko]), key).toEqual(placeholders(text));
    }
  });
});

describe("t", () => {
  afterEach(() => setLocale("ko"));
  it("fills placeholders in the current locale", () => {
    expect(t("graph.run", { n: 5 })).toBe("커밋 5개 · 눌러서 펼치기");
    setLocale("en");
    expect(t("graph.run", { n: 5 })).toBe("5 commits · click to expand");
  });
});
