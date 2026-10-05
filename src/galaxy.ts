// The galaxy dashboard's reading of each repository: which signals it gives
// off (stopped mid-merge, changes, commits to pull or push...) and how many
// worlds give off each. Pure, so it is unit-tested.

import type { RepoGlance } from "./types";

/** Most urgent first: the order chips are shown in and the tally is read in. */
const SIGNALS = ["missing", "stopped", "changes", "behind", "ahead", "stash"] as const;
type Signal = (typeof SIGNALS)[number];

interface Lit {
  signal: Signal;
  /** Count to show next to it (files, commits, stashes); 0 for none. */
  n: number;
}

/** The signals a repository gives off, most urgent first. A quiet one gives none. */
export function signals(g: RepoGlance): Lit[] {
  if (g.error) return [{ signal: "missing", n: 0 }];
  const lit: Lit[] = [];
  if (g.state !== "clean" || g.conflicts > 0) lit.push({ signal: "stopped", n: g.conflicts });
  if (g.changes > 0) lit.push({ signal: "changes", n: g.changes });
  if (g.behind > 0) lit.push({ signal: "behind", n: g.behind });
  if (g.ahead > 0) lit.push({ signal: "ahead", n: g.ahead });
  if (g.stashes > 0) lit.push({ signal: "stash", n: g.stashes });
  return lit;
}

/** How many repositories give off each signal (only the ones some do). */
export function tally(list: RepoGlance[]): Lit[] {
  const count = new Map<Signal, number>();
  for (const g of list) for (const { signal } of signals(g)) count.set(signal, (count.get(signal) ?? 0) + 1);
  return SIGNALS.filter((s) => count.has(s)).map((signal) => ({ signal, n: count.get(signal)! }));
}

/** Repositories a batch pull goes to: readable, on a branch with an upstream, not stopped mid-operation. */
export const pullable = (list: RepoGlance[]) =>
  list.filter((g) => !g.error && g.branch && g.upstream && g.state === "clean").map((g) => g.path);

/** Repositories a batch branch switch goes to: readable and not stopped mid-operation. */
export const switchable = (list: RepoGlance[]) =>
  list.filter((g) => !g.error && g.state === "clean").map((g) => g.path);

/** Repositories a "fetch all" goes to: readable ones with somewhere to fetch from. */
export const fetchable = (list: RepoGlance[]) => list.filter((g) => !g.error && g.remotes > 0).map((g) => g.path);
