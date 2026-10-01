import { describe, expect, it } from "vitest";
import { defaults, parseSettings } from "./settings";

describe("parseSettings", () => {
  const base = defaults();
  it("falls back to defaults for missing or broken data", () => {
    expect(parseSettings(null, base)).toEqual(base);
    expect(parseSettings("{oops", base)).toEqual(base);
    expect(parseSettings("42", base)).toEqual(base);
  });
  it("keeps valid fields and drops invalid ones", () => {
    const s = parseSettings(
      JSON.stringify({ animate: false, historyPage: 7, gitPath: "/opt/git", language: "fr" }),
      base,
    );
    expect(s).toEqual({ animate: false, historyPage: 3000, gitPath: "/opt/git", language: "system" });
    expect(parseSettings(JSON.stringify({ language: "en" }), base).language).toBe("en");
    expect(parseSettings(JSON.stringify({ historyPage: 10000 }), base).historyPage).toBe(10000);
  });
  it("respects reduced motion by default", () => {
    expect(defaults(true).animate).toBe(false);
  });
});
