import { useEffect, useMemo, useRef, useState } from "react";
import type { FileChange } from "../types";

interface Props {
  changes: FileChange[];
  branch: string | null;
  merging: boolean;
  busy: boolean;
  onClose(): void;
  onOpenFile(path: string): void;
  onCommit(message: string, paths: string[], newBranch: string | null): void;
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
export function Composer({ changes, branch, merging, busy, onClose, onOpenFile, onCommit }: Props) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(changes.map((c) => c.path)));
  const [message, setMessage] = useState("");
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
    !busy && message.trim() !== "" && (merging || picked.size > 0) && (!useBranch || newBranch.trim() !== "");

  const submit = () => {
    if (!canCommit) return;
    onCommit(message.trim(), merging ? [] : [...picked], useBranch ? newBranch.trim() : null);
  };

  return (
    <aside className="panel composer">
      <header>
        <div>
          <div className="eyebrow">새 체크포인트</div>
          <h2>
            {useBranch && newBranch ? newBranch : (branch ?? "detached HEAD")}
            <span className="muted"> 에 커밋</span>
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

      {!merging && (
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

      <button className="primary" disabled={!canCommit} onClick={submit}>
        {busy ? "커밋 중…" : "체크포인트 추가"}
        <kbd>⌘/Ctrl ⏎</kbd>
      </button>
    </aside>
  );
}
