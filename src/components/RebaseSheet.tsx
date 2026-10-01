import { useState } from "react";
import { fmtTime } from "../format";
import { ACTIONS, move, planProblem, resultCount } from "../rebasePlan";
import type { CommitInfo, RebaseAction, RebaseStep } from "../types";
import { t } from "../i18n";

interface Props {
  branch: string;
  base: CommitInfo;
  /** Commits after `base`, oldest first. */
  commits: CommitInfo[];
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
export function RebaseSheet({ branch, base, commits, initial, unpushed, busy, onApply, onClose }: Props) {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const [steps, setSteps] = useState<RebaseStep[]>(() => initial ?? commits.map((c) => ({ id: c.id, action: "pick" })));
  const [dragging, setDragging] = useState<number | null>(null);
  const problem = planProblem(steps);
  const changed = steps.some((s, i) => s.action !== "pick" || s.id !== commits[i].id);
  // Rewriting a commit the upstream already has means force-pushing afterwards.
  const rewritesPushed = unpushed !== null && commits.length > unpushed;

  const setAction = (i: number, action: RebaseAction) =>
    setSteps((ss) => ss.map((s, j) => (j === i ? { ...s, action } : s)));
  const shift = (i: number, d: number) => {
    const j = i + d;
    if (j >= 0 && j < steps.length) setSteps((ss) => move(ss, i, j));
  };

  return (
    <section className="diff-sheet rebase-sheet" style={{ height: "50vh" }}>
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
          ✕
        </button>
      </header>

      <ol className="rb-list">
        {steps.map((s, i) => {
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
                if (dragging !== null && dragging !== i) {
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
                  disabled={i === 0}
                  onClick={() => shift(i, -1)}
                >
                  ↑
                </button>
                <button
                  title={t("rb.down")}
                  aria-label={t("rb.downOf", { summary: c.summary })}
                  disabled={i === steps.length - 1}
                  onClick={() => shift(i, 1)}
                >
                  ↓
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
        ) : (
          <span className="muted">{t("rb.safe")}</span>
        )}
        <button className="primary" disabled={busy || !changed || problem !== null} onClick={() => onApply(steps)}>
          {t("rb.apply")}
        </button>
      </footer>
    </section>
  );
}
