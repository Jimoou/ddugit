// Recently opened repositories (and favourites), kept in localStorage. Pure
// list operations so they are unit-tested; App owns reading and writing.

export interface RecentRepo {
  path: string;
  /** Pinned to the top and never dropped for being old. */
  starred: boolean;
  /** Last opened, ms since epoch. */
  at: number;
}

/** Unstarred entries kept; starred ones are always kept. */
export const RECENT_MAX = 12;

/** Folder name shown for a path (either separator, trailing ones ignored). */
export const repoName = (path: string) =>
  path
    .replace(/[\\/]+$/, "")
    .split(/[\\/]/)
    .pop() || path;

/** Stored JSON → list, dropping anything malformed. */
export function parseRecent(raw: string | null): RecentRepo[] {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  return v.flatMap((o: unknown) => {
    const r = o as Partial<RecentRepo> | null;
    return r && typeof r.path === "string" && r.path
      ? [{ path: r.path, starred: r.starred === true, at: typeof r.at === "number" ? r.at : 0 }]
      : [];
  });
}

/** Starred first, then most recently opened. */
export const sortRecent = (list: RecentRepo[]) =>
  [...list].sort((a, b) => Number(b.starred) - Number(a.starred) || b.at - a.at);

/** Record that `path` was opened at `now`, keeping its star, and trim old unstarred ones. */
export function touchRecent(list: RecentRepo[], path: string, now: number): RecentRepo[] {
  const old = list.find((r) => r.path === path);
  const next = sortRecent([{ path, starred: old?.starred ?? false, at: now }, ...list.filter((r) => r !== old)]);
  let unstarred = 0;
  return next.filter((r) => r.starred || ++unstarred <= RECENT_MAX);
}

export const toggleStar = (list: RecentRepo[], path: string) =>
  list.map((r) => (r.path === path ? { ...r, starred: !r.starred } : r));

export const forgetRecent = (list: RecentRepo[], path: string) => list.filter((r) => r.path !== path);

/** `https://host/me/proj.git`, `git@host:me/proj.git`, `/srv/proj/` → `proj`. */
export function nameFromUrl(url: string): string {
  const last =
    url
      .trim()
      .replace(/[\\/]+$/, "")
      .split(/[\\/:]/)
      .pop() ?? "";
  return last.replace(/\.git$/, "");
}

/** `parent` + `name` with the separator `parent` already uses. */
export function joinPath(parent: string, name: string): string {
  const sep = parent.includes("\\") && !parent.includes("/") ? "\\" : "/";
  return parent.replace(/[\\/]+$/, "") + sep + name;
}
