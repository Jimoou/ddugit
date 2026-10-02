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
    expect(s).toEqual({
      animate: false,
      historyPage: 3000,
      gitPath: "/opt/git",
      language: "system",
      rotation: 0,
      sidebarCollapsed: false,
      closedSections: [],
    });
    expect(parseSettings(JSON.stringify({ closedSections: ["tag", "stash"] }), base).closedSections).toEqual([
      "tag",
      "stash",
    ]);
    expect(parseSettings(JSON.stringify({ closedSections: [1] }), base).closedSections).toEqual([]);
    expect(parseSettings(JSON.stringify({ rotation: 3 }), base).rotation).toBe(3);
    expect(parseSettings(JSON.stringify({ rotation: 4 }), base).rotation).toBe(0);
    expect(parseSettings(JSON.stringify({ language: "en" }), base).language).toBe("en");
    expect(parseSettings(JSON.stringify({ historyPage: 10000 }), base).historyPage).toBe(10000);
  });
  it("respects reduced motion by default", () => {
    expect(defaults(true).animate).toBe(false);
  });
});
