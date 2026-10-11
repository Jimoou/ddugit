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
      space: true,
      glow: true,
      historyPage: 3000,
      gitPath: "/opt/git",
      theme: "system",
      language: "system",
      rotation: 0,
      sidebarCollapsed: false,
      sidebarWidth: 220,
      panelWidth: 340,
      minimap: true,
      mapLocked: false,
      closedSections: [],
      confirmRemote: { fetch: false, pull: true, push: true },
      profiles: [],
      editor: "",
      diffTool: "",
      mergeTool: "",
    });
    expect(parseSettings(JSON.stringify({ editor: "code", diffTool: "-x" }), base)).toMatchObject({
      editor: "code",
      diffTool: "",
    });
    expect(parseSettings(JSON.stringify({ confirmRemote: { push: false, pull: "x" } }), base).confirmRemote).toEqual({
      fetch: false,
      pull: true,
      push: false,
    });
    expect(parseSettings(JSON.stringify({ closedSections: ["tag", "stash"] }), base).closedSections).toEqual([
      "tag",
      "stash",
    ]);
    expect(parseSettings(JSON.stringify({ closedSections: [1] }), base).closedSections).toEqual([]);
    expect(parseSettings(JSON.stringify({ rotation: 3 }), base).rotation).toBe(3);
    expect(parseSettings(JSON.stringify({ space: false, glow: "no" }), base)).toMatchObject({
      space: false,
      glow: true,
    });
    expect(parseSettings(JSON.stringify({ rotation: 4 }), base).rotation).toBe(0);
    expect(parseSettings(JSON.stringify({ language: "en" }), base).language).toBe("en");
    expect(parseSettings(JSON.stringify({ theme: "light" }), base).theme).toBe("light");
    expect(parseSettings(JSON.stringify({ theme: "sepia" }), base).theme).toBe("system");
    expect(parseSettings(JSON.stringify({ historyPage: 10000 }), base).historyPage).toBe(10000);
  });
  it("keeps side widths within their ranges, and the minimap and lock switches", () => {
    expect(parseSettings(JSON.stringify({ sidebarWidth: 301.6, panelWidth: 5000 }), base)).toMatchObject({
      sidebarWidth: 302,
      panelWidth: 720,
    });
    expect(parseSettings(JSON.stringify({ sidebarWidth: "wide", panelWidth: null }), base)).toMatchObject({
      sidebarWidth: 220,
      panelWidth: 340,
    });
    expect(parseSettings(JSON.stringify({ minimap: false, mapLocked: true }), base)).toMatchObject({
      minimap: false,
      mapLocked: true,
    });
  });
  it("respects reduced motion by default", () => {
    expect(defaults(true).animate).toBe(false);
  });
});
