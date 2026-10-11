import { useSyncExternalStore } from "react";

/** The colour scheme the user asked for; `system` follows the OS. */
export type ThemePref = "system" | "dark" | "light";
/** The scheme in effect. */
export type Theme = "dark" | "light";
export const THEMES: readonly ThemePref[] = ["system", "dark", "light"];

const LIGHT = "(prefers-color-scheme: light)";

const systemTheme = (): Theme =>
  typeof window !== "undefined" && window.matchMedia?.(LIGHT).matches ? "light" : "dark";

export const resolveTheme = (pref: ThemePref, system: Theme): Theme => (pref === "system" ? system : pref);

function subscribe(changed: () => void) {
  const query = window.matchMedia?.(LIGHT);
  query?.addEventListener("change", changed);
  return () => query?.removeEventListener("change", changed);
}

/** The scheme in effect for `pref`, following the OS while it is `system`. */
export function useTheme(pref: ThemePref): Theme {
  const system = useSyncExternalStore(subscribe, systemTheme, () => "dark" as const);
  return resolveTheme(pref, system);
}
