import { describe, expect, it } from "vitest";
import { isEditor, isToolName, parseExternal, platformOf, toolNames } from "./external";

describe("external apps", () => {
  const base = { editor: "", diffTool: "", mergeTool: "" };
  it("keeps well-formed picks and drops the rest", () => {
    expect(parseExternal({ editor: " code ", diffTool: "meld", mergeTool: "kdiff3" }, base)).toEqual({
      editor: "code",
      diffTool: "meld",
      mergeTool: "kdiff3",
    });
    expect(parseExternal({ editor: "/Applications/Zed.app", diffTool: "--extcmd=sh", mergeTool: 3 }, base)).toEqual({
      editor: "/Applications/Zed.app",
      diffTool: "",
      mergeTool: "",
    });
    expect(parseExternal({ editor: "code\n--x", diffTool: "a b" }, { ...base, editor: "subl" })).toEqual({
      ...base,
      editor: "subl",
    });
  });
  it("accepts tool names git could know, never options or paths", () => {
    for (const ok of ["", "meld", "vscode", "bc3", "my_tool-2.x"]) expect(isToolName(ok), ok).toBe(true);
    for (const bad of ["-x", "--tool=x", "a/b", "a b", "../x", ".hidden"]) expect(isToolName(bad), bad).toBe(false);
    expect(isEditor("C:\\Program Files\\Code\\Code.exe")).toBe(true);
    expect(isEditor("--help")).toBe(false);
  });
  it("names the file manager after the system", () => {
    expect(platformOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("mac");
    expect(platformOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("win");
    expect(platformOf("Mozilla/5.0 (X11; Linux x86_64)")).toBe("linux");
  });
  it("lists configured tools first, then git's own, keeping the current pick", () => {
    expect(toolNames(["vscode", "meld"], ["kdiff3", "meld"], "")).toEqual(["vscode", "meld", "kdiff3"]);
    expect(toolNames([], ["meld"], "araxis")).toEqual(["araxis", "meld"]);
  });
});
