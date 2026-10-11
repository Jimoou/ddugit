// How the user wants branches drawn, per repository: a colour chosen for a
// branch (`#rrggbb` from the palette, by base name so a local branch and its
// upstream match) and the branches hidden from the map (as `kind:name`).
// Pure; `repo/useBranchLook.ts` keeps it in localStorage.

import { isHex } from "./color";
import type { RefInfo } from "./types";

export interface BranchLook {
  colors: Record<string, string>;
  hidden: string[];
}

export const EMPTY_LOOK: BranchLook = { colors: {}, hidden: [] };

/** A ref as the hidden list names it. */
export const refKey = (r: Pick<RefInfo, "kind" | "name">) => `${r.kind}:${r.name}`;

/** Every repository's look from storage; anything malformed is left out. */
export function parseLooks(raw: string | null): Record<string, BranchLook> {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, BranchLook> = {};
  for (const [path, look] of Object.entries(v as Record<string, unknown>)) {
    const l = look as Partial<Record<keyof BranchLook, unknown>> | null;
    if (!l || typeof l !== "object") continue;
    const colors =
      l.colors && typeof l.colors === "object" && !Array.isArray(l.colors)
        ? Object.fromEntries(Object.entries(l.colors).filter(([, c]) => isHex(c)))
        : {};
    const hidden = Array.isArray(l.hidden) ? l.hidden.filter((h): h is string => typeof h === "string") : [];
    out[path] = { colors, hidden: [...new Set(hidden)] };
  }
  return out;
}

/** `look` with `base` painted `color` (null: back to the automatic colour). */
export function withColor(look: BranchLook, base: string, color: string | null): BranchLook {
  const { [base]: _, ...rest } = look.colors;
  return { ...look, colors: color === null ? rest : { ...rest, [base]: color } };
}

/** `look` with `keys` hidden, or shown again. */
export function withHidden(look: BranchLook, keys: string[], hide: boolean): BranchLook {
  const rest = look.hidden.filter((h) => !keys.includes(h));
  return { ...look, hidden: hide ? [...rest, ...keys] : rest };
}
