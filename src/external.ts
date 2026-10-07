// Opening things outside the app: which editor and diff / merge tools the settings
// may hold, and what the system's file manager is called. Pure; the backend
// checks everything again (open.rs, git/tools.rs) before anything runs.

import type { Key } from "./i18n";

/** The user's picks: `editor` "" is the system's default app; a tool "" is what git is set up with. */
export interface ExternalApps {
  editor: string;
  diffTool: string;
  mergeTool: string;
}

/** Editors offered by name in the settings (the backend finds them on PATH). */
export const EDITOR_CHOICES = [
  { value: "code", label: "Visual Studio Code" },
  { value: "cursor", label: "Cursor" },
  { value: "windsurf", label: "Windsurf" },
  { value: "zed", label: "Zed" },
  { value: "subl", label: "Sublime Text" },
  { value: "idea", label: "IntelliJ IDEA" },
  { value: "webstorm", label: "WebStorm" },
  { value: "pycharm", label: "PyCharm" },
] as const;

/** A tool name git could know (`--tool=<name>`): no option, no spaces, no paths. "" is "as git is set up". */
export const isToolName = (v: string) => v === "" || /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/.test(v);

/** An editor setting: a name or a full path on one line, else nothing ("" is the default app). */
export const isEditor = (v: string) => !/[\r\n\0]/.test(v) && !v.trim().startsWith("-");

/** Stored settings → the external apps, keeping only well-formed values. */
export function parseExternal(o: Record<string, unknown>, base: ExternalApps): ExternalApps {
  const pick = (k: keyof ExternalApps, ok: (v: string) => boolean) => {
    const v = o[k];
    return typeof v === "string" && ok(v) ? v.trim() : base[k];
  };
  return {
    editor: pick("editor", isEditor),
    diffTool: pick("diffTool", isToolName),
    mergeTool: pick("mergeTool", isToolName),
  };
}

export type Platform = "mac" | "win" | "linux";

export function platformOf(userAgent: string): Platform {
  if (/Mac OS X|Macintosh/.test(userAgent)) return "mac";
  if (/Windows/.test(userAgent)) return "win";
  return "linux";
}

/** "Reveal in Finder", "Show in Explorer" or "Show in file manager". */
export const REVEAL: Record<Platform, Key> = {
  mac: "open.reveal.mac",
  win: "open.reveal.win",
  linux: "open.reveal.linux",
};

/** Tools for a settings list: those set up in git config, then git's own, and the current pick if neither has it. */
export function toolNames(custom: string[], known: string[], current: string): string[] {
  const all = [...custom, ...known.filter((k) => !custom.includes(k))];
  return current && !all.includes(current) ? [current, ...all] : all;
}
