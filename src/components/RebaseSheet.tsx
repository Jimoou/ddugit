import { Icon } from "./Icon";
import { useState } from "react";
import { fmtTime } from "../format";
import { ACTIONS, applyPlan, move, planProblem, resultCount, runsProblem, todoRuns } from "../rebasePlan";
import type { CommitInfo, RebaseAction, RebaseStep, TodoItem } from "../types";
import { t } from "../i18n";
import { useDialog } from "./useDialog";

interface Props {
  branch: string;
  base: CommitInfo;
  /** Commits after `base`, oldest first (with merges: the todo's picks, in its order). */
  commits: CommitInfo[];
  /**
   * With merges in the range, git's `--rebase-merges` todo: merges stay as they
   * are, and commits move only within their line (run of picks between merges).
   */
  todo?: TodoItem[] | null;
  /** Starting plan (e.g. from dragging a commit in the graph); defaults to all picked in order. */
  initial?: RebaseStep[] | null;
  /** How many of the newest commits are not on the upstream yet (null: no upstream). */
  unpushed: number | null;
  busy: boolean;
  onApply(steps: RebaseStep[]): void;
  onClose(): void;
}

/**
 * Interactive rebase as a list: drag rows (or use ↑↓) to reorder, pick an
 * action per commit, apply. Top is oldest, the order git replays them in.
 */
export function RebaseSheet({ branch, base, commits, todo, initial, unpushed, busy, onApply, onClose }: Props) {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const [steps, setSteps] = useState<RebaseStep[]>(() => initial ?? commits.map((c) => ({ id: c.id, action: "pick" })));
  const [dragging, setDragging] = useState<number | null>(null);
  const runOf = todo ? todoRuns(todo) : null;
  const sameRun = (i: number, j: number) => !runOf || runOf.get(steps[i]?.id) === runOf.get(steps[j]?.id);
  const problem = runOf
    ? steps.every((x) => x.action === "drop")
      ? planProblem(steps)
      : runsProblem(steps, runOf)
    : planProblem(steps);
  // Labels a merge brings back in: the line built before them is a merged side.
  const merged = new Set(todo?.flatMap((x) => (x.kind === "merge" ? [x.label] : [])) ?? []);
  const rows = todo
    ? applyPlan(todo, steps)
    : steps.map((st) => ({ kind: "pick" as const, id: st.id, summary: "", action: st.action }));
  const changed = steps.some((s, i) => s.action !== "pick" || s.id !== commits[i].id);
  // Rewriting a commit the upstream already has means force-pushing afterwards.
  const rewritesPushed = unpushed !== null && commits.length > unpushed;

  const setAction = (i: number, action: RebaseAction) =>
    setSteps((ss) => ss.map((s, j) => (j === i ? { ...s, action } : s)));
  const shift = (i: number, d: number) => {
    const j = i + d;
    if (j >= 0 && j < steps.length && sameRun(i, j)) setSteps((ss) => move(ss, i, j));
  };

  // Esc must not throw away a plan the user has edited; the close button still does.
  const sheet = useDialog(changed ? () => {} : onClose, false);
  return (
    <section className="diff-sheet rebase-sheet" style={{ height: "50vh" }} {...sheet}>
      <header>
        <div className="title">
          <span className="eyebrow">{t("rb.title")}</span>
          <b>{branch}</b>
          <span className="muted">
            {base.summary} <code>{base.id.slice(0, 7)}</code>{" "}
            {t("rb.summary", { n: commits.length, m: resultCount(steps) })}
          </span>
        </div>
        <span className="muted keys">{t("rb.keys")}</span>
        <button className="icon" onClick={onClose} title={t("common.close")}>
          <Icon name="close" />
        </button>
      </header>

      <ol className="rb-list">
        {rows.map((row, k) => {
          if (row.kind === "merge")
            return (
              <li key={`m${k}`} className="rb-merge">
                <Icon name="branch" size={12} />
                <span className="summary">{row.summary || row.label}</span>
                {row.id && <code>{row.id.slice(0, 7)}</code>}
              </li>
            );
          if (row.kind === "reset") {
            // Where the next line starts: a side that a merge brings back, or back on the main line.
            const next = rows.slice(k + 1).find((x) => x.kind === "label");
            const side = next?.kind === "label" && merged.has(next.name);
            if (k <= 1 && !side) return null;
            return (
              <li key={`r${k}`} className={`rb-line ${side ? "side" : ""}`} aria-hidden>
                {side && next?.kind === "label" && `${t("rb.line")} · ${next.name}`}
              </li>
            );
          }
          if (row.kind === "label") return null;
          const i = steps.findIndex((x) => x.id === row.id);
          const s = steps[i];
          const c = byId.get(s.id)!;
          return (
            <li
              key={s.id}
              draggable
              className={`rb-${s.action} ${dragging === i ? "dragging" : ""}`}
              onDragStart={(e) => {
                setDragging(i);
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (dragging !== null && dragging !== i && sameRun(dragging, i)) {
                  setSteps((ss) => move(ss, dragging, i));
                  setDragging(i);
                }
              }}
              onDragEnd={() => setDragging(null)}
            >
              <span className="rb-grip" aria-hidden>
                ⋮⋮
              </span>
              <span className="rb-move">
                <button
                  title={t("rb.up")}
                  aria-label={t("rb.upOf", { summary: c.summary })}
                  disabled={i === 0 || !sameRun(i, i - 1)}
                  onClick={() => shift(i, -1)}
                >
                  <Icon name="arrowUp" size={12} />
                </button>
                <button
                  title={t("rb.down")}
                  aria-label={t("rb.downOf", { summary: c.summary })}
                  disabled={i === steps.length - 1 || !sameRun(i, i + 1)}
                  onClick={() => shift(i, 1)}
                >
                  <Icon name="arrowDown" size={12} />
                </button>
              </span>
              <select
                aria-label={t("rb.actionOf", { summary: c.summary })}
                value={s.action}
                onChange={(e) => setAction(i, e.target.value as RebaseAction)}
              >
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {t(a.label)}
                  </option>
                ))}
              </select>
              <code>{c.id.slice(0, 7)}</code>
              <span className="summary">{c.summary}</span>
              <span className="muted">
                {c.author} · {fmtTime(c.time, false)}
              </span>
            </li>
          );
        })}
      </ol>

      <footer className="conflict-foot">
        {problem ? (
          <span className="danger-text">{problem}</span>
        ) : rewritesPushed ? (
          <span className="warn-text">{t("rb.pushed")}</span>
        ) : null}
        <button className="primary" disabled={busy || !changed || problem !== null} onClick={() => onApply(steps)}>
          {t("rb.apply")}
        </button>
      </footer>
    </section>
  );
}
