import type { CommitInfo, RefInfo, SearchKind } from "../types";

/** Where the search bar looks: the loaded graph (instant), or the whole history by one `SearchKind`. */
export type SearchMode = "loaded" | SearchKind;

/**
 * Commits matching `query`, newest first (same order as `commits`).
 *
 * A query matches the message, author name or email (case-insensitive), a ref
 * name pointing at the commit, or — when it looks like hex of 4+ chars — a SHA
 * prefix.
 */
export function searchCommits(commits: CommitInfo[], refs: RefInfo[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const sha = /^[0-9a-f]{4,40}$/.test(q);
  const refHits = new Set(refs.filter((r) => r.name.toLowerCase().includes(q)).map((r) => r.target));
  return commits
    .filter(
      (c) =>
        (sha && c.id.startsWith(q)) ||
        refHits.has(c.id) ||
        c.message.toLowerCase().includes(q) ||
        c.author.toLowerCase().includes(q) ||
        c.email.toLowerCase().includes(q),
    )
    .map((c) => c.id);
}

/** At most this many whole-history results per search. */
export const HISTORY_HITS = 200;
/** How much history the graph may load to show an old result (beyond it, the result stays unloaded). */
export const REVEAL_MAX = 50_000;

/**
 * The next history size to read when looking for a commit older than the `loaded` ones: double it
 * (a few reads reach far back), up to `max`; null once there.
 */
export function nextLimit(loaded: number, max = REVEAL_MAX): number | null {
  if (loaded >= max) return null;
  return Math.min(Math.max(loaded * 2, 1000), max);
}

/** Identifies a whole-history search, so an answer is only shown for the question it answers. */
export const searchKey = (mode: SearchMode, query: string, regex: boolean) => `${mode}\n${regex}\n${query.trim()}`;
