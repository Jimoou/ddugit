// Interactive rebase planning: which commits a rebase from `base` rewrites,
// and whether a plan is one git will accept. Pure, so it is unit-tested.

import { type Key, t } from "./i18n";
import type { CommitInfo, RebaseAction, RebaseStep, TodoItem } from "./types";

/**
 * Commits after `base` up to `head`, oldest first, following first parents.
 * Returns a reason instead when `base` isn't on that line or a merge is in the
 * way (then the plan comes from git's `--rebase-merges` todo: see `todoRuns`).
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

/**
 * The run (line of history between merges) of each pick in a `--rebase-merges`
 * todo: commits can be reordered within their run, never across.
 */
export function todoRuns(todo: TodoItem[]): Map<string, number> {
  const runs = new Map<string, number>();
  let run = 0;
  let inRun = false;
  for (const item of todo) {
    if (item.kind === "pick") {
      if (!inRun) run++;
      runs.set(item.id, run);
    }
    inRun = item.kind === "pick";
  }
  return runs;
}

/** Why git would reject `steps` over runs, or null: each run's first kept commit must be a pick. */
export function runsProblem(steps: RebaseStep[], runOf: Map<string, number>): string | null {
  const first = new Map<number, RebaseAction>();
  for (const s of steps) {
    const run = runOf.get(s.id) ?? 0;
    if (s.action !== "drop" && !first.has(run)) first.set(run, s.action);
  }
  return [...first.values()].some((a) => a === "squash" || a === "fixup") ? t("plan.runSquash") : null;
}

/**
 * The todo as it will run: each run's picks in the order of `steps`, each with
 * its action (git/rebase.rs `apply_plan` does the same to git's text).
 */
export function applyPlan(
  todo: TodoItem[],
  steps: RebaseStep[],
): (Exclude<TodoItem, { kind: "pick" }> | (Extract<TodoItem, { kind: "pick" }> & { action: RebaseAction }))[] {
  const runOf = todoRuns(todo);
  const at = new Map(steps.map((s, i) => [s.id, i]));
  const queue = new Map<number, RebaseStep[]>();
  for (const s of steps) {
    const run = runOf.get(s.id);
    if (run !== undefined) queue.set(run, [...(queue.get(run) ?? []), s]);
  }
  const byId = new Map(todo.flatMap((x) => (x.kind === "pick" ? [[x.id, x] as const] : [])));
  return todo.map((item) => {
    if (item.kind !== "pick") return item;
    const step = queue.get(runOf.get(item.id)!)!.shift()!;
    return { ...byId.get(step.id)!, action: steps[at.get(step.id)!].action };
  });
}
