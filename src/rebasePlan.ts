// Interactive rebase planning: which commits a rebase from `base` rewrites,
// and whether a plan is one git will accept. Pure, so it is unit-tested.

import { type Key, t } from "./i18n";
import type { CommitInfo, RebaseAction, RebaseStep } from "./types";

/**
 * Commits after `base` up to `head`, oldest first, following first parents.
 * Returns a reason instead when `base` isn't an ancestor or a merge is in the
 * way (merges need `--rebase-merges`, which this editor doesn't model).
 */
export function rebaseRange(byId: Map<string, CommitInfo>, head: string, base: string): CommitInfo[] | string {
  const out: CommitInfo[] = [];
  for (let id: string | undefined = head; id !== base;) {
    const c: CommitInfo | undefined = id ? byId.get(id) : undefined;
    if (!c) return t("plan.notOnBranch");
    if (c.parents.length > 1) return t("plan.hasMerge");
    out.push(c);
    id = c.parents[0];
  }
  return out.reverse();
}

/** Why git would reject `steps`, or null when it is fine. */
export function planProblem(steps: RebaseStep[]): string | null {
  const first = steps.find((s) => s.action !== "drop");
  if (!first) return t("plan.dropAll");
  if (first.action === "squash" || first.action === "fixup") return t("plan.firstSquash");
  return null;
}

/** Commits left afterwards: squash / fixup meld into a pick, drop removes. */
export const resultCount = (steps: RebaseStep[]) => steps.filter((s) => s.action === "pick").length;

/** Move the step at `from` to `to` (indices into the same list). */
export function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export const ACTIONS: { value: RebaseAction; label: Key }[] = [
  { value: "pick", label: "plan.action.pick" },
  { value: "squash", label: "plan.action.squash" },
  { value: "fixup", label: "plan.action.fixup" },
  { value: "drop", label: "plan.action.drop" },
];

/**
 * Plan for dragging `source` onto `target` on the current branch: the
 * commits from the older of the two up to HEAD, with `source` moved to just
 * after `target`. Null when either isn't on HEAD's straight history (no merge
 * in between, not the root) or the move changes nothing.
 */
export function planMove(
  byId: Map<string, CommitInfo>,
  head: string,
  source: string,
  target: string,
): { base: string; steps: RebaseStep[] } | null {
  const tail: CommitInfo[] = []; // newest first, up to the first merge
  for (let c = byId.get(head); c && c.parents.length === 1; c = byId.get(c.parents[0])) tail.push(c);
  const [s, t] = [tail.findIndex((c) => c.id === source), tail.findIndex((c) => c.id === target)];
  if (s < 0 || t < 0 || s === t) return null;
  const oldest = tail[Math.max(s, t)];
  const ids = tail
    .slice(0, Math.max(s, t) + 1)
    .reverse()
    .map((c) => c.id);
  const moved = ids.filter((id) => id !== source);
  moved.splice(moved.indexOf(target) + 1, 0, source);
  if (moved.every((id, i) => id === ids[i])) return null;
  return { base: oldest.parents[0], steps: moved.map((id) => ({ id, action: "pick" as const })) };
}
