// What a fetch, pull or push is about to move, read from the loaded history so
// the confirmation can list it before anything leaves or arrives.

import { ancestorsOf } from "./graph/layout";
import type { CommitInfo, RefInfo, RepoSnapshot } from "./types";

export type SyncOp = "fetch" | "pull" | "push";

export interface SyncPlan {
  op: SyncOp;
  /** The tracking branch (`origin/main`); null before the first push. */
  upstream: string | null;
  /** Commits that would go out (push) or come in (pull), newest first. */
  commits: CommitInfo[];
  /** Uncommitted changes in the work tree (a pull may need them out of the way). */
  dirty: boolean;
}

/** Commits reachable from `from` but not from `not` (newest first, in history order). */
export function between(commits: CommitInfo[], from: string | null, not: string | null): CommitInfo[] {
  if (!from) return [];
  const have = ancestorsOf(commits, from);
  const drop = not ? ancestorsOf(commits, not) : new Set<string>();
  return commits.filter((c) => have.has(c.id) && !drop.has(c.id));
}

/** For a branch with no upstream yet: its commits that no remote branch has. */
function unpublished(commits: CommitInfo[], head: string | null, refs: RefInfo[]): CommitInfo[] {
  if (!head) return [];
  const remote = new Set<string>();
  for (const r of refs) if (r.kind === "remote") for (const id of ancestorsOf(commits, r.target)) remote.add(id);
  const mine = ancestorsOf(commits, head);
  return commits.filter((c) => mine.has(c.id) && !remote.has(c.id));
}

export function syncPlan(snap: RepoSnapshot, op: SyncOp): SyncPlan {
  const { head } = snap;
  const tip = snap.refs.find((r) => r.kind === "remote" && r.name === head.upstream)?.target ?? null;
  const commits =
    op === "push"
      ? head.upstream
        ? between(snap.commits, head.target, tip)
        : unpublished(snap.commits, head.target, snap.refs)
      : op === "pull"
        ? between(snap.commits, tip, head.target)
        : [];
  return { op, upstream: head.upstream, commits, dirty: snap.changes.length > 0 };
}
