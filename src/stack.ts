// Stacked branches as the sidebar draws them: one group per stack, each branch
// under the one it sits on.

import type { StackBranch } from "./types";

export interface StackRow {
  branch: StackBranch;
  /** 0 for the stack's lowest branch. */
  depth: number;
}

export interface StackGroup {
  /** What the stack is built on (e.g. `main`): the lowest branch's parent. */
  base: string;
  rows: StackRow[];
  /** Some branch in it needs restacking. */
  behind: boolean;
}

/** Group stacked branches into stacks, each listed depth first from its lowest branch. */
export function stackGroups(all: StackBranch[]): StackGroup[] {
  const byName = new Map(all.map((b) => [b.name, b]));
  const kids = new Map<string, StackBranch[]>();
  for (const b of all) kids.set(b.parent, [...(kids.get(b.parent) ?? []), b]);
  const groups: StackGroup[] = [];
  const seen = new Set<string>();
  const walk = (b: StackBranch, depth: number, rows: StackRow[]) => {
    if (seen.has(b.name)) return;
    seen.add(b.name);
    rows.push({ branch: b, depth });
    for (const k of kids.get(b.name) ?? []) walk(k, depth + 1, rows);
  };
  // A stack starts at a branch whose parent isn't stacked itself.
  for (const root of all.filter((b) => !byName.has(b.parent))) {
    const rows: StackRow[] = [];
    walk(root, 0, rows);
    groups.push({ base: root.parent, rows, behind: rows.some((r) => r.branch.behind) });
  }
  return groups;
}
