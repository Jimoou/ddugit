// Interactive rebase planning: which commits a rebase from `base` rewrites,
// and whether a plan is one git will accept. Pure, so it is unit-tested.

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
    if (!c) return "기준 커밋이 현재 브랜치의 이력에 없어요";
    if (c.parents.length > 1) return "사이에 병합 커밋이 있어서 여기서는 정리할 수 없어요";
    out.push(c);
    id = c.parents[0];
  }
  return out.reverse();
}

/** Why git would reject `steps`, or null when it is fine. */
export function planProblem(steps: RebaseStep[]): string | null {
  const first = steps.find((s) => s.action !== "drop");
  if (!first) return "모든 커밋을 버리게 돼요. 하나는 남겨 주세요";
  if (first.action === "squash" || first.action === "fixup") return "맨 위(가장 오래된) 커밋은 합칠 대상이 없어요";
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

export const ACTIONS: { value: RebaseAction; label: string }[] = [
  { value: "pick", label: "유지" },
  { value: "squash", label: "위와 합치기 (메시지 합침)" },
  { value: "fixup", label: "위와 합치기 (메시지 버림)" },
  { value: "drop", label: "버리기" },
];
