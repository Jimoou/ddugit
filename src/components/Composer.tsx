import { useEffect, useMemo, useRef, useState } from "react";
import type { FileChange } from "../types";

interface Props {
  changes: FileChange[];
  branch: string | null;
  merging: boolean;
  busy: boolean;
  onClose(): void;
  onOpenFile(path: string): void;
  /** Full message of HEAD, prefilled when switching to amend; `null` without commits. */
  headMessage: string | null;
  /** Open in amend mode (from the HEAD node's context menu). */
  startAmend?: boolean;
  /** HEAD is already on the upstream: amending rewrites shared history. */
  headPushed: boolean;
  onCommit(message: string, paths: string[], newBranch: string | null, amend: boolean): void;
  /** Put the picked files away in a stash (message may be empty). */
  onStash(message: string, paths: string[]): void;
  /** Throw the picked files' changes away (caller confirms). */
  onDiscard(paths: string[]): void;
}

const LABEL: Record<string, string> = {
  added: "A",
  untracked: "U",
  modified: "M",
  deleted: "D",
  renamed: "R",
  typechange: "T",
};

function kind(c: FileChange): string {
  if (c.conflicted) return "conflict";
  return c.unstaged ?? c.staged ?? "modified";
}

/** Panel opened from the [+] node after HEAD: pick files, write a message, commit. */
export function Composer(props: Props) {
  const { changes, branch, merging, busy, onClose, onOpenFile, onCommit, onStash, onDiscard } = props;
  const { headMessage, startAmend = false, headPushed } = props;
  const [amend, setAmend] = useState(startAmend && headMessage !== null);
  // Amend from the menu = reword: nothing picked until the user chooses files.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(amend ? [] : changes.map((c) => c.path)));
  const [message, setMessage] = useState(amend ? (headMessage ?? "").trim() : "");
  const [newBranch, setNewBranch] = useState("");
  const [useBranch, setUseBranch] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const prevKnown = useRef(new Set(changes.map((c) => c.path)));
  // Keep selection in sync when the file list refreshes (new files default to picked).
  const paths = useMemo(() => changes.map((c) => c.path).join("\n"), [changes]);
  useEffect(() => {
    setPicked((prev) => {
      const next = new Set<string>();
      for (const c of changes) if (prev.has(c.path) || !prevKnown.current.has(c.path)) next.add(c.path);
      prevKnown.current = new Set(changes.map((c) => c.path));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);
  useEffect(() => msgRef.current?.focus(), []);

  const all = picked.size === changes.length && changes.length > 0;
  const canCommit =
    !busy &&
    message.trim() !== "" &&
    (merging || amend || picked.size > 0) &&
    (amend || !useBranch || newBranch.trim() !== "");

  const submit = () => {
    if (!canCommit) return;
    onCommit(message.trim(), merging ? [] : [...picked], !amend && useBranch ? newBranch.trim() : null, amend);
  };

  return (
    <aside className="panel composer">
      <header>
        <div>
          <div className="eyebrow">{amend ? "마지막 커밋 수정" : "새 체크포인트"}</div>
          <h2>
            {!amend && useBranch && newBranch ? newBranch : (branch ?? "detached HEAD")}
            <span className="muted">{amend ? " 의 마지막 커밋" : " 에 커밋"}</span>
          </h2>
        </div>
        <button className="icon" onClick={onClose} title="닫기 (Esc)">
          ✕
        </button>
      </header>

      {merging && <div className="note warn">병합 진행 중 — 모든 변경을 한 번에 커밋해 병합을 완료합니다.</div>}

      <div className="files-head">
        <label className="check">
          <input
            type="checkbox"
            checked={all}
            disabled={merging}
            onChange={() => setPicked(all ? new Set() : new Set(changes.map((c) => c.path)))}
          />
          <span>변경된 파일 {changes.length}개</span>
        </label>
        <span className="muted">{picked.size}개 선택</span>
      </div>

      <ul className="files">
        {changes.length === 0 && <li className="empty">변경 사항이 없어요. 파일을 수정하면 여기에 나타납니다.</li>}
        {changes.map((c) => {
          const k = kind(c);
          return (
            <li key={c.path}>
              <label className="check">
                <input
                  type="checkbox"
                  disabled={merging}
                  checked={merging || picked.has(c.path)}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(c.path)) n.delete(c.path);
                      else n.add(c.path);
                      return n;
                    })
                  }
                />
                <span className={`chip k-${k}`}>{k === "conflict" ? "!" : (LABEL[k] ?? "M")}</span>
                <span
                  className="path link"
                  title={`${c.path} — 클릭해서 diff 보기`}
                  onClick={(e) => {
                    e.preventDefault(); // don't toggle the checkbox
                    onOpenFile(c.path);
                  }}
                >
                  {c.path}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <textarea
        ref={msgRef}
        className="message"
        placeholder="무엇을 바꿨나요? (첫 줄은 요약)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") onClose();
        }}
        rows={4}
      />

      {!merging && headMessage !== null && (
        <label className="check">
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => {
              setAmend(e.target.checked);
              if (e.target.checked && !message.trim()) setMessage(headMessage.trim());
            }}
          />
          <span>마지막 커밋 수정 (amend) — 선택한 파일 없이 메시지만 바꿀 수도 있어요</span>
        </label>
      )}
      {amend && headPushed && (
        <div className="note warn">이 커밋은 이미 push됐어요. 수정하면 다시 올릴 때 강제 push가 필요합니다.</div>
      )}

      {!merging && !amend && (
        <div className="branch-opt">
          <label className="check">
            <input type="checkbox" checked={useBranch} onChange={(e) => setUseBranch(e.target.checked)} />
            <span>새 브랜치로 갈라져서 커밋</span>
          </label>
          {useBranch && (
            <input
              className="text"
              placeholder="feature/my-idea"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value.replace(/\s+/g, "-"))}
            />
          )}
        </div>
      )}

      {!merging && (
        <div className="row side-actions">
          <button
            disabled={busy || picked.size === 0}
            title="선택한 변경을 스태시에 보관하고 작업 트리에서 치웁니다"
            onClick={() => onStash(message.trim(), all ? [] : [...picked])}
          >
            ◇ 스태시에 보관
          </button>
          <button
            className="danger ghost"
            disabled={busy || picked.size === 0}
            title="선택한 파일의 변경을 버립니다 (되돌릴 수 없음)"
            onClick={() => onDiscard([...picked])}
          >
            선택 버리기
          </button>
        </div>
      )}

      <button className="primary" disabled={!canCommit} onClick={submit}>
        {busy ? "커밋 중…" : amend ? "커밋 수정" : "체크포인트 추가"}
        <kbd>⌘/Ctrl ⏎</kbd>
      </button>
    </aside>
  );
}
