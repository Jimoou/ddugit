import type { CommitInfo, RefInfo } from "../types";

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
