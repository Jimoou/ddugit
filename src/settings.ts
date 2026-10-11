// User settings kept in localStorage. Parsing is pure (and tested) so a
// corrupt or older stored value falls back to defaults instead of breaking.

import type { Turn } from "./graph/renderer";
import type { Key, LanguagePref } from "./i18n";
import { type ExternalApps, parseExternal } from "./external";
import { parseProfiles } from "./identity";
import { THEMES, type ThemePref } from "./theme";
import type { Profile } from "./types";

/** With the editor and diff / merge tools to open things in (`external.ts`). */
export interface Settings extends ExternalApps {
  /** Sparkles flowing along edges and node birth bursts. */
  animate: boolean;
  /** The galaxy (nebulae, stars) behind the graph and the home screen; off is a plain dark backdrop. */
  space: boolean;
  /** Neon glow around lines, commits and the [+] node. */
  glow: boolean;
  /** Commits loaded at once (and per "load more"). */
  historyPage: number;
  /** git executable; empty means `git` on PATH. */
  gitPath: string;
  /** Colour scheme; "system" follows the OS. */
  theme: ThemePref;
  /** UI language; "system" follows the OS (Korean if it is Korean, else English). */
  language: LanguagePref;
  /** The graph turned in quarter turns clockwise (0: time runs left → right). */
  rotation: Turn;
  /** Left sidebar folded to a thin rail. */
  sidebarCollapsed: boolean;
  /** Widths of the left sidebar and the right panel (inspector, composer), px; dragged by their edges. */
  sidebarWidth: number;
  panelWidth: number;
  /** The overview strip under (or beside) the graph. */
  minimap: boolean;
  /** The map is locked: commits can't be dragged onto each other (merge, cherry-pick, rebase, reorder). */
  mapLocked: boolean;
  /** Sidebar sections folded shut, by id ("local", "remote", "tag", "pulls", "stash"). */
  closedSections: string[];
  /** Ask before each kind of remote work (fetch only reads, so it isn't asked by default). */
  confirmRemote: Record<"fetch" | "pull" | "push", boolean>;
  /** Saved identities (name, email, signing key) to apply to repositories or globally. */
  profiles: Profile[];
}

export const HISTORY_PAGES = [1000, 3000, 10000] as const;
/** Resizable side widths, px. */
export const SIDEBAR_WIDTH = { min: 180, initial: 220, max: 440 } as const;
export const PANEL_WIDTH = { min: 280, initial: 340, max: 720 } as const;
export const clampWidth = (w: number, range: { min: number; max: number }) =>
  Math.round(Math.min(range.max, Math.max(range.min, w)));
export const LANGUAGES: readonly LanguagePref[] = ["system", "ko", "en"];

export function defaults(reducedMotion = false): Settings {
  return {
    animate: !reducedMotion,
    space: true,
    glow: true,
    historyPage: 3000,
    gitPath: "",
    theme: "system",
    language: "system",
    rotation: 0,
    sidebarCollapsed: false,
    sidebarWidth: SIDEBAR_WIDTH.initial,
    panelWidth: PANEL_WIDTH.initial,
    minimap: true,
    mapLocked: false,
    closedSections: [],
    confirmRemote: { fetch: false, pull: true, push: true },
    profiles: [],
    editor: "",
    diffTool: "",
    mergeTool: "",
  };
}

function parseConfirm(v: unknown, base: Settings["confirmRemote"]): Settings["confirmRemote"] {
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  const pick = (k: keyof typeof base) => (typeof o[k] === "boolean" ? (o[k] as boolean) : base[k]);
  return { fetch: pick("fetch"), pull: pick("pull"), push: pick("push") };
}

/** Stored JSON → settings, keeping only well-formed fields. */
export function parseSettings(raw: string | null, base: Settings): Settings {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return base;
  }
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  return {
    animate: typeof o.animate === "boolean" ? o.animate : base.animate,
    space: typeof o.space === "boolean" ? o.space : base.space,
    glow: typeof o.glow === "boolean" ? o.glow : base.glow,
    historyPage:
      typeof o.historyPage === "number" && (HISTORY_PAGES as readonly number[]).includes(o.historyPage)
        ? o.historyPage
        : base.historyPage,
    gitPath: typeof o.gitPath === "string" ? o.gitPath : base.gitPath,
    theme: THEMES.find((x) => x === o.theme) ?? base.theme,
    language: LANGUAGES.find((l) => l === o.language) ?? base.language,
    rotation: ([0, 1, 2, 3] as const).find((r) => r === o.rotation) ?? base.rotation,
    sidebarCollapsed: typeof o.sidebarCollapsed === "boolean" ? o.sidebarCollapsed : base.sidebarCollapsed,
    sidebarWidth:
      typeof o.sidebarWidth === "number" && Number.isFinite(o.sidebarWidth)
        ? clampWidth(o.sidebarWidth, SIDEBAR_WIDTH)
        : base.sidebarWidth,
    panelWidth:
      typeof o.panelWidth === "number" && Number.isFinite(o.panelWidth)
        ? clampWidth(o.panelWidth, PANEL_WIDTH)
        : base.panelWidth,
    minimap: typeof o.minimap === "boolean" ? o.minimap : base.minimap,
    mapLocked: typeof o.mapLocked === "boolean" ? o.mapLocked : base.mapLocked,
    closedSections:
      Array.isArray(o.closedSections) && o.closedSections.every((x) => typeof x === "string")
        ? o.closedSections
        : base.closedSections,
    confirmRemote: parseConfirm(o.confirmRemote, base.confirmRemote),
    profiles: parseProfiles(o.profiles) ?? base.profiles,
    ...parseExternal(o, base),
  };
}

/**
 * Repository commands on ⌘/Ctrl + Shift + a letter (plain ⌘/Ctrl + letter is taken by the
 * app, the window and the OS: B, F, R, T, W, P for print…). Handled in `repo/CommandKeys.tsx`.
 */
export const COMMAND_KEYS = {
  fetch: "F",
  pull: "P",
  push: "U",
  newBranch: "B",
  stash: "S",
  commit: "C",
} as const;
export type CommandKey = keyof typeof COMMAND_KEYS;

/** How a command's key reads in menus, tooltips and the shortcut table. */
export const shortcutLabel = (k: CommandKey) => `⌘/Ctrl + Shift + ${COMMAND_KEYS[k]}`;

type KeyPress = Pick<KeyboardEvent, "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;

/** The command a key press asks for, if any. By key position too, so it works with a Korean input mode on. */
export function commandOf(e: KeyPress): CommandKey | null {
  if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.altKey) return null;
  const found = Object.entries(COMMAND_KEYS).find(
    ([, letter]) => e.key.toUpperCase() === letter || e.code === `Key${letter}`,
  );
  return found ? (found[0] as CommandKey) : null;
}

/** `keys` and `what` are dictionary keys, or literal text (key names like "Enter"). */
interface Shortcut {
  keys: Key | string;
  what: Key | string;
}

/** Shown in the settings screen; keep in sync with the handlers. */
export const SHORTCUTS: { group: Key; items: Shortcut[] }[] = [
  {
    group: "keys.graph",
    items: [
      { keys: "keys.wheel", what: "keys.wheel.what" },
      { keys: "keys.zoom", what: "keys.zoom.what" },
      { keys: "keys.shiftWheel", what: "keys.shiftWheel.what" },
      { keys: "+ / -", what: "keys.plusMinus.what" },
      { keys: "0", what: "keys.fit.what" },
      { keys: "H", what: "keys.head.what" },
      { keys: "R", what: "keys.rotate.what" },
      { keys: "L", what: "keys.lock.what" },
      { keys: "M", what: "keys.minimap.what" },
      { keys: "⌘/Ctrl + B", what: "keys.sidebar.what" },
      { keys: "⌘/Ctrl + R", what: "keys.refresh.what" },
      { keys: "keys.dragMerge", what: "keys.dragMerge.what" },
      { keys: "keys.altDrag", what: "keys.altDrag.what" },
      { keys: "keys.shiftDrag", what: "keys.shiftDrag.what" },
      { keys: "keys.modDrag", what: "keys.modDrag.what" },
      { keys: "keys.rightClick", what: "keys.rightClick.what" },
      { keys: "keys.pickClick", what: "keys.pickClick.what" },
      { keys: "← / →", what: "keys.leftRight.what" },
      { keys: "↑ / ↓", what: "keys.upDown.what" },
      { keys: "Enter", what: "keys.enter.what" },
      { keys: "Esc", what: "keys.esc.what" },
    ],
  },
  {
    group: "keys.search",
    items: [
      { keys: "⌘/Ctrl + F", what: "keys.find.what" },
      { keys: "Enter / Shift + Enter", what: "keys.findStep.what" },
    ],
  },
  {
    group: "keys.repo",
    items: (Object.keys(COMMAND_KEYS) as CommandKey[]).map((k) => ({ keys: shortcutLabel(k), what: `keys.cmd.${k}` })),
  },
  {
    group: "keys.commit",
    items: [
      { keys: "⌘/Ctrl + Enter", what: "keys.commitKey.what" },
      { keys: "[ / ]", what: "keys.files.what" },
      { keys: "keys.lines", what: "keys.lines.what" },
    ],
  },
  {
    group: "keys.tabs",
    items: [
      { keys: "⌘/Ctrl + 0", what: "keys.home.what" },
      { keys: "⌘/Ctrl + T", what: "keys.tabNew.what" },
      { keys: "⌘/Ctrl + W", what: "keys.tabClose.what" },
      { keys: "Ctrl + Tab / Ctrl + Shift + Tab", what: "keys.tabCycle.what" },
      { keys: "⌘/Ctrl + 1…9", what: "keys.tabPick.what" },
    ],
  },
  { group: "keys.app", items: [{ keys: "?", what: "keys.help.what" }] },
];
