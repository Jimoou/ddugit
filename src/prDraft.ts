// A new pull request's defaults, worked out from the loaded history: which
// commits it brings, its base, title and body, and whether the branch must be
// pushed first. Pure; the dialog is `components/CreatePr.tsx`.

import type { CommitInfo, RefInfo } from "./types";

/** Commits reachable from `head` but not from `base`, newest first (the snapshot's order). */
export function commitsBetween(commits: CommitInfo[], head: string, base: string | null): CommitInfo[] {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const reach = (from: string | null) => {
    const seen = new Set<string>();
    const stack = from ? [from] : [];
    while (stack.length) {
      const id = stack.pop()!;
      if (seen.has(id)) continue;
      seen.add(id);
      stack.push(...(byId.get(id)?.parents ?? []));
    }
    return seen;
  };
  const theirs = reach(base);
  const mine = reach(head);
  return commits.filter((c) => mine.has(c.id) && !theirs.has(c.id));
}

/** Branch names on `remote` (without its prefix), sorted. */
export function remoteBranches(refs: RefInfo[], remote: string): string[] {
  const prefix = `${remote}/`;
  return refs
    .filter((r) => r.kind === "remote" && r.name.startsWith(prefix) && r.name !== `${prefix}HEAD`)
    .map((r) => r.name.slice(prefix.length))
    .sort((a, b) => a.localeCompare(b));
}

/** The usual base: the project's default branch, else main / master, else the first one; never the head. */
export function pickBase(branches: string[], head: string, preferred: string | null): string | null {
  const ok = branches.filter((b) => b !== head);
  return [preferred, "main", "master"].find((b) => b && ok.includes(b)) ?? ok[0] ?? null;
}

/** `feature/graph-zoom` → `Graph zoom`. */
export function humanize(branch: string): string {
  const words = (branch.split("/").pop() ?? branch).replace(/[-_]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : branch;
}

/** One commit: its summary. Several: the branch name, readable. */
export function defaultTitle(branch: string, commits: CommitInfo[]): string {
  return commits.length === 1 ? commits[0].summary : humanize(branch);
}

/** One commit: the rest of its message. Several: their summaries, oldest first. */
export function defaultBody(commits: CommitInfo[]): string {
  if (commits.length === 1) return commits[0].message.split("\n").slice(1).join("\n").trim();
  return [...commits]
    .reverse()
    .map((c) => `- ${c.summary}`)
    .join("\n");
}

type PushNeed = { kind: "none" } | { kind: "missing" } | { kind: "ahead"; n: number };

/** Whether `branch` must go up to `remote` first: not there yet, or with commits the copy there lacks. */
export function pushNeed(commits: CommitInfo[], refs: RefInfo[], remote: string, branch: string): PushNeed {
  const local = refs.find((r) => r.kind === "local" && r.name === branch);
  const there = refs.find((r) => r.kind === "remote" && r.name === `${remote}/${branch}`);
  if (!there) return { kind: "missing" };
  if (!local || local.target === there.target) return { kind: "none" };
  const n = commitsBetween(commits, local.target, there.target).length;
  return n ? { kind: "ahead", n } : { kind: "none" };
}
