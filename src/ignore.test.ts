import { describe, expect, it } from "vitest";
import { escapeIgnore, ignoreChoices } from "./ignore";

describe("ignoreChoices", () => {
  it("offers the file, its extension and its folder", () => {
    expect(ignoreChoices("src/logs/debug.log")).toEqual({
      file: "/src/logs/debug.log",
      ext: { ext: "log", pattern: "*.log" },
      dir: { dir: "src/logs", pattern: "/src/logs/" },
    });
  });

  it("leaves out what a path doesn't have", () => {
    expect(ignoreChoices("Makefile")).toEqual({ file: "/Makefile", ext: null, dir: null });
    // A dotfile's name is not an extension.
    expect(ignoreChoices(".env").ext).toBeNull();
    expect(ignoreChoices("notes.").ext).toBeNull();
    expect(ignoreChoices("a.tar.gz").ext).toEqual({ ext: "gz", pattern: "*.gz" });
  });

  it("keeps a folder entry a folder", () => {
    expect(ignoreChoices("build/out/")).toEqual({
      file: "/build/out/",
      ext: null,
      dir: { dir: "build", pattern: "/build/" },
    });
  });

  it("escapes glob characters so only that name matches", () => {
    expect(ignoreChoices("data/[draft] *notes?.md").file).toBe("/data/\\[draft\\] \\*notes\\?.md");
    expect(ignoreChoices("we[i]rd/x.t*").ext?.pattern).toBe("*.t\\*");
    expect(ignoreChoices("we[i]rd/x.t*").dir?.pattern).toBe("/we\\[i\\]rd/");
  });

  it("keeps trailing spaces and backslashes", () => {
    expect(escapeIgnore("name  ")).toBe("name\\ \\ ");
    expect(escapeIgnore("a\\b")).toBe("a\\\\b");
    expect(escapeIgnore("#hash")).toBe("#hash");
  });
});
