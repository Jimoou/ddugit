// Repository groups: each recent repository is in at most one group (like a
// folder); the rest are ungrouped. Groups keep their own order, name, colour
// and folded state. Pure list operations, so they are unit-tested; the
// storage lives with the recent list (`components/Connect.tsx`).

import { parentDir, type RecentRepo, repoName } from "./recent";

export interface RepoGroup {
  id: string;
  name: string;
  /** Hue of its colour, degrees. */
  hue: number;
  collapsed: boolean;
}

/** Colours handed out in turn (and cycled through by "change colour"). */
export const GROUP_HUES = [190, 300, 95, 35, 260, 0, 160, 220];

/** A stored (or dragged) JSON list of strings; anything else, malformed or not, is an empty list. */
export function parseStringList(raw: string | null): string[] {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function parseGroups(raw: string | null): RepoGroup[] {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.flatMap((o: unknown) => {
    const g = o as Partial<RepoGroup> | null;
    if (!g || typeof g.id !== "string" || !g.id || typeof g.name !== "string" || seen.has(g.id)) return [];
    seen.add(g.id);
    return [
      {
        id: g.id,
        name: g.name,
        hue: typeof g.hue === "number" ? g.hue : GROUP_HUES[0],
        collapsed: g.collapsed === true,
      },
    ];
  });
}

/** A new group at the end, coloured with the next hue in turn. */
export function addGroup(groups: RepoGroup[], id: string, name: string): RepoGroup[] {
  return [...groups, { id, name: name.trim(), hue: GROUP_HUES[groups.length % GROUP_HUES.length], collapsed: false }];
}

export const updateGroup = (groups: RepoGroup[], id: string, patch: Partial<Omit<RepoGroup, "id">>) =>
  groups.map((g) => (g.id === id ? { ...g, ...patch } : g));

/** The next colour in `GROUP_HUES` after the group's current one. */
export function nextHue(hue: number): number {
  const i = GROUP_HUES.indexOf(hue);
  return GROUP_HUES[(i + 1) % GROUP_HUES.length];
}

/** Move a group `delta` places (clamped). */
export function moveGroup(groups: RepoGroup[], id: string, delta: number): RepoGroup[] {
  const i = groups.findIndex((g) => g.id === id);
  if (i < 0) return groups;
  const j = Math.max(0, Math.min(groups.length - 1, i + delta));
  const next = [...groups];
  next.splice(j, 0, next.splice(i, 1)[0]);
  return next;
}

/** Put `paths` in group `id` (`null`: take them out of their group). */
export function assignGroup(list: RecentRepo[], paths: string[], id: string | null): RecentRepo[] {
  const set = new Set(paths);
  return list.map((r) => {
    if (!set.has(r.path)) return r;
    const { group: _, ...rest } = r;
    return id ? { ...rest, group: id } : rest;
  });
}

/** Removing a group leaves its repositories ungrouped. */
export function removeGroup(
  groups: RepoGroup[],
  list: RecentRepo[],
  id: string,
): { groups: RepoGroup[]; list: RecentRepo[] } {
  return {
    groups: groups.filter((g) => g.id !== id),
    list: assignGroup(
      list,
      list.filter((r) => r.group === id).map((r) => r.path),
      null,
    ),
  };
}

interface Band {
  /** null: the ungrouped ones. */
  group: RepoGroup | null;
  repos: RecentRepo[];
}

/**
 * The dashboard's bands: every group in order (empty ones too, so a new group
 * shows), then the ungrouped. A repository whose group no longer exists counts
 * as ungrouped. Inside a band the recent order (stars first) holds.
 */
export function bands(groups: RepoGroup[], list: RecentRepo[]): Band[] {
  const known = new Set(groups.map((g) => g.id));
  return [
    ...groups.map((group) => ({ group, repos: list.filter((r) => r.group === group.id) })),
    { group: null, repos: list.filter((r) => !r.group || !known.has(r.group)) },
  ];
}

/** Who owns a remote: `https://github.com/acme/x.git`, `git@github.com:acme/x.git` → github.com/acme. Local paths → null. */
export function ownerOf(url: string | null): { host: string; owner: string } | null {
  if (!url) return null;
  const m = /^(?:[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/|[^@/]+@([^:/]+):)([^/]+)\/[^/]/i.exec(url.trim());
  if (!m) return null;
  return { host: (m[1] ?? m[2]).toLowerCase(), owner: m[3] };
}

interface Suggestion {
  /** Stable id, to remember a "no thanks". */
  key: string;
  name: string;
  paths: string[];
}

/**
 * One grouping to offer for ungrouped repositories: those of the same forge
 * owner (an organisation), else those in the same folder. Only sets of two or
 * more that aren't simply every ungrouped repository; the biggest wins, an
 * owner before a folder; dismissed ones are skipped.
 */
export function suggestGroup(
  list: RecentRepo[],
  origins: Map<string, string | null>,
  groups: RepoGroup[],
  dismissed: string[],
): Suggestion | null {
  const known = new Set(groups.map((g) => g.id));
  const loose = list.filter((r) => !r.group || !known.has(r.group)).map((r) => r.path);
  const by = (prefix: string, keyOf: (p: string) => { key: string; name: string } | null) => {
    const sets = new Map<string, Suggestion>();
    for (const p of loose) {
      const k = keyOf(p);
      if (!k) continue;
      const s = sets.get(k.key) ?? { key: `${prefix}:${k.key}`, name: k.name, paths: [] };
      s.paths.push(p);
      sets.set(k.key, s);
    }
    return [...sets.values()];
  };
  const candidates = [
    ...by("owner", (p) => {
      const o = ownerOf(origins.get(p) ?? null);
      return o && { key: `${o.host}/${o.owner}`.toLowerCase(), name: o.owner };
    }),
    ...by("dir", (p) => ({ key: parentDir(p), name: repoName(parentDir(p)) })),
  ].filter((s) => s.paths.length >= 2 && s.paths.length < loose.length && !dismissed.includes(s.key));
  // Stable sort keeps owners ahead of folders of the same size.
  return candidates.sort((a, b) => b.paths.length - a.paths.length)[0] ?? null;
}
