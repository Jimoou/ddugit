// Open repository tabs as pure data: which paths are open, which one shows.
// A tab without a path is the welcome screen (a "new tab").

export interface Tab {
  id: number;
  path: string | null;
}
export interface Tabs {
  list: Tab[];
  /** Id of the visible tab. */
  active: number;
}

const nextId = (t: Tabs) => Math.max(0, ...t.list.map((x) => x.id)) + 1;

export const activeTab = (t: Tabs): Tab => t.list.find((x) => x.id === t.active) ?? t.list[0];

/** Show `path`: its tab if open, else the current welcome tab, else a new tab. */
export function openIn(t: Tabs, path: string): Tabs {
  const open = t.list.find((x) => x.path === path);
  if (open) return { ...t, active: open.id };
  const cur = activeTab(t);
  if (cur && cur.path === null)
    return { ...t, list: t.list.map((x) => (x.id === cur.id ? { ...x, path } : x)), active: cur.id };
  const id = nextId(t);
  return { list: [...t.list, { id, path }], active: id };
}

/** A new welcome tab after the others. */
export function addEmpty(t: Tabs): Tabs {
  const id = nextId(t);
  return { list: [...t.list, { id, path: null }], active: id };
}

/** Close a tab; the one to its right (or left) shows next, and closing the last leaves a welcome tab. */
export function closeTab(t: Tabs, id: number): Tabs {
  const i = t.list.findIndex((x) => x.id === id);
  if (i < 0) return t;
  const list = t.list.filter((x) => x.id !== id);
  if (list.length === 0) return { list: [{ id: nextId(t), path: null }], active: nextId(t) };
  const active = t.active === id ? list[Math.min(i, list.length - 1)].id : t.active;
  return { list, active };
}

/** Select by position (0-based); out of range keeps the current tab. */
export const selectAt = (t: Tabs, i: number): Tabs => (t.list[i] ? { ...t, active: t.list[i].id } : t);

/** Next / previous tab, wrapping around. */
export function cycle(t: Tabs, delta: number): Tabs {
  const i = t.list.findIndex((x) => x.id === t.active);
  return selectAt(t, (i + delta + t.list.length) % t.list.length);
}

/** Stored form: paths in order and the visible index. Welcome tabs aren't kept. */
export function serializeTabs(t: Tabs): string {
  const paths = t.list.flatMap((x) => (x.path ? [x.path] : []));
  const ap = activeTab(t).path;
  return JSON.stringify({ paths, active: ap ? paths.indexOf(ap) : paths.length - 1 });
}

export function parseTabs(raw: string | null, fallback: string | null): Tabs {
  let paths: string[] = [];
  let active = 0;
  try {
    const v = raw ? (JSON.parse(raw) as { paths?: unknown; active?: unknown }) : null;
    if (v && Array.isArray(v.paths)) paths = [...new Set(v.paths.filter((p): p is string => typeof p === "string"))];
    if (v && typeof v.active === "number") active = v.active;
  } catch {
    /* broken: start over */
  }
  if (paths.length === 0 && fallback) paths = [fallback];
  if (paths.length === 0) return { list: [{ id: 1, path: null }], active: 1 };
  const list = paths.map((path, i) => ({ id: i + 1, path }));
  return { list, active: list[Math.min(Math.max(active, 0), list.length - 1)].id };
}
