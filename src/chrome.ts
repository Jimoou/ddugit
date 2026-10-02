// Which window frame the desktop app draws itself (see tauri.macos/windows.conf.json):
// macOS keeps its traffic lights over our tab row, Windows gets our own buttons,
// anything else (Linux, the browser demo) keeps the system title bar.

export type Chrome = "mac" | "win" | "native";

export function chromeOf(userAgent: string, tauri: boolean): Chrome {
  if (!tauri) return "native";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "mac";
  if (/Windows/.test(userAgent)) return "win";
  return "native";
}
