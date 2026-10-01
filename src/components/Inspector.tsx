import { useState } from "react";
import { fmtTime } from "../format";
import type { CommitInfo, FileDiff, RefInfo } from "../types";
import { ChangedFiles } from "./ChangedFiles";

interface Props {
  commit: CommitInfo;
  refs: RefInfo[];
  /** Changed files; `null` while loading. */
  files: FileDiff[] | null;
  color: string;
  isHead: boolean;
  busy: boolean;
  onClose(): void;
  onCheckout(branch: string): void;
  onCreateBranch(name: string, at: string): void;
  onSelect(id: string): void;
  onOpenFile(path: string): void;
}

export function Inspector(props: Props) {
  const { commit, refs, files, color, isHead, busy, onClose, onCheckout, onCreateBranch, onSelect, onOpenFile } = props;
  const [name, setName] = useState("");
  const body = commit.message.split("\n").slice(1).join("\n").trim();
  const locals = refs.filter((r) => r.kind === "local");

  return (
    <aside className="panel inspector" style={{ ["--accent" as string]: color }}>
      <header>
        <div>
          <div className="eyebrow">체크포인트 {isHead && <span className="head-pill">HEAD</span>}</div>
          <h2>{commit.summary || "(메시지 없음)"}</h2>
        </div>
        <button className="icon" onClick={onClose} title="닫기 (Esc)">
          ✕
        </button>
      </header>

      {refs.length > 0 && (
        <div className="refs">
          {refs.map((r) => (
            <span key={r.kind + r.name} className={`ref ref-${r.kind}`}>
              {r.kind === "remote" ? "☁ " : r.kind === "tag" ? "◆ " : ""}
              {r.name}
            </span>
          ))}
        </div>
      )}

      {body && <pre className="body">{body}</pre>}

      <dl className="meta">
        <dt>작성자</dt>
        <dd>
          {commit.author} <span className="muted">&lt;{commit.email}&gt;</span>
        </dd>
        <dt>시간</dt>
        <dd>{fmtTime(commit.time)}</dd>
        <dt>커밋</dt>
        <dd>
          <code className="sha" title="클릭해서 복사" onClick={() => navigator.clipboard?.writeText(commit.id)}>
            {commit.id.slice(0, 12)}
          </code>
        </dd>
        {commit.parents.length > 0 && (
          <>
            <dt>{commit.parents.length > 1 ? "병합한 부모" : "부모"}</dt>
            <dd className="parents">
              {commit.parents.map((p) => (
                <code key={p} className="sha link" onClick={() => onSelect(p)}>
                  {p.slice(0, 7)}
                </code>
              ))}
            </dd>
          </>
        )}
      </dl>

      <ChangedFiles files={files} onOpen={onOpenFile} />

      {locals.length > 0 && (
        <div className="actions">
          {locals.map((r) => (
            <button key={r.name} disabled={busy} onClick={() => onCheckout(r.name)}>
              ⇢ {r.name} 체크아웃
            </button>
          ))}
        </div>
      )}

      <form
        className="actions inline"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onCreateBranch(name.trim(), commit.id);
          setName("");
        }}
      >
        <input
          className="text"
          placeholder="여기서 새 브랜치…"
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\s+/g, "-"))}
        />
        <button type="submit" disabled={busy || !name.trim()}>
          만들고 이동
        </button>
      </form>

      <p className="tip">팁: 이 점을 끌어서 다른 브랜치 끝에 놓으면 병합돼요.</p>
    </aside>
  );
}
