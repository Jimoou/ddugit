import { useState } from "react";
import { fmtTime } from "../format";
import { ACTIONS, move, planProblem, resultCount } from "../rebasePlan";
import type { CommitInfo, RebaseAction, RebaseStep } from "../types";

interface Props {
  branch: string;
  base: CommitInfo;
  /** Commits after `base`, oldest first. */
  commits: CommitInfo[];
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
export function RebaseSheet({ branch, base, commits, unpushed, busy, onApply, onClose }: Props) {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const [steps, setSteps] = useState<RebaseStep[]>(() => commits.map((c) => ({ id: c.id, action: "pick" })));
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
          <span className="eyebrow">커밋 정리</span>
          <b>{branch}</b>
          <span className="muted">
            {base.summary} <code>{base.id.slice(0, 7)}</code> 다음 커밋 {commits.length}개 → {resultCount(steps)}개
          </span>
        </div>
        <span className="muted keys">끌어서 순서 바꾸기 · 위가 먼저(오래된 것)</span>
        <button className="icon" onClick={onClose} title="닫기">
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
                <button title="위로" aria-label={`${c.summary} 위로`} disabled={i === 0} onClick={() => shift(i, -1)}>
                  ↑
                </button>
                <button
                  title="아래로"
                  aria-label={`${c.summary} 아래로`}
                  disabled={i === steps.length - 1}
                  onClick={() => shift(i, 1)}
                >
                  ↓
                </button>
              </span>
              <select
                aria-label={`${c.summary} 처리`}
                value={s.action}
                onChange={(e) => setAction(i, e.target.value as RebaseAction)}
              >
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
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
          <span className="warn-text">이미 push한 커밋도 바뀌어요. 적용한 뒤에는 강제 push가 필요해요.</span>
        ) : (
          <span className="muted">충돌이 나면 충돌 해결 화면으로 이어지고, 언제든 취소할 수 있어요.</span>
        )}
        <button className="primary" disabled={busy || !changed || problem !== null} onClick={() => onApply(steps)}>
          적용 (rebase)
        </button>
      </footer>
    </section>
  );
}
