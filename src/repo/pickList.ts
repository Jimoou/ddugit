// Commits picked together in the graph (⌘/Ctrl-click one at a time, Shift-click a line of
// them) for one action on all: which are picked, and the order an action takes them in.

import type { CommitInfo } from "../types";

/** `id` in or out of the picked list (the rest keep their order). */
export const togglePick = (picked: string[], id: string) =>
  picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id];

/** `ids` added to the picked list, each once. */
export const addPicks = (picked: string[], ids: string[]) => [...picked, ...ids.filter((id) => !picked.includes(id))];

/**
 * The commits from `a` to `b` (both included) when one is on the other's first-parent
 * line, i.e. along a branch as it was committed; null when they are on separate lines.
 */
export function firstParentLine(byId: Map<string, CommitInfo>, a: string, b: string): string[] | null {
  const walk = (from: string, to: string) => {
    const line: string[] = [];
    for (let cur: string | undefined = from; cur; cur = byId.get(cur)?.parents[0]) {
      line.push(cur);
      if (cur === to) return line;
    }
    return null;
  };
  return walk(a, b) ?? walk(b, a);
}

/**
 * `ids` in history order: oldest first (to copy them as they were made) or newest first
 * (to undo them). `order` numbers commits newest first, like the snapshot lists them.
 */
export function inHistoryOrder(ids: string[], order: Map<string, number>, oldestFirst: boolean) {
  const sorted = [...ids].sort((x, y) => (order.get(x) ?? 0) - (order.get(y) ?? 0));
  return oldestFirst ? sorted.reverse() : sorted;
}
