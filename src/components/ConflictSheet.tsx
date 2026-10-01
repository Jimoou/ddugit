import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { conflictCount, parseConflicts, type Pick, resolveText } from "../conflict";
import type { ConflictFile, Resolution } from "../types";

interface Props {
  path: string;
  /** Files still in conflict (from the snapshot). */
  files: string[];
  /** Repository state: decides what "ours" / "theirs" mean. */
  state: string;
  initialFile?: string;
  busy: boolean;
  onResolve(file: string, how: Resolution): void;
  onClose(): void;
}

/** Side names per operation. During a rebase git's "ours" is the branch being rebased onto. */
const SIDES: Record<string, [ours: string, theirs: string]> = {
  merge: ["현재 브랜치", "병합하려는 쪽"],
  rebase: ["기준 브랜치", "내 커밋"],
  "cherry-pick": ["현재 브랜치", "가져오는 커밋"],
  revert: ["현재 브랜치", "되돌리는 변경"],
};

/** Bottom sheet for resolving conflicts block by block (or a whole file at once). */
export function ConflictSheet({ path, files, state, initialFile, busy, onResolve, onClose }: Props) {
  const [file, setFile] = useState(initialFile ?? files[0]);
  const [data, setData] = useState<ConflictFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<(Pick | undefined)[]>([]);
  const [ours, theirs] = SIDES[state] ?? ["ours", "theirs"];

  // Move on when the current file gets resolved.
  useEffect(() => {
    if (!file || !files.includes(file)) setFile(files[0]);
  }, [files, file]);

  useEffect(() => {
    setData(null);
    setError(null);
    setPicks([]);
    if (!file) return;
    let live = true;
    api.conflictFile(path, file).then(
      (d) => live && setData(d),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [path, file]);

  const segments = useMemo(() => (data ? parseConflicts(data.merged) : []), [data]);
  const total = conflictCount(segments);
  const chosen = picks.filter(Boolean).length;
  let blockNo = -1;

  return (
    <section className="diff-sheet conflict-sheet" style={{ height: "55vh" }}>
      <header>
        <div className="title">
          <span className="eyebrow danger">충돌 해결</span>
          <b>{file ?? "모두 해결됨"}</b>
          <span className="muted">남은 파일 {files.length}개</span>
        </div>
        {data && !data.binary && (
          <div className="row">
            <button disabled={busy} onClick={() => onResolve(file!, { kind: "ours" })}>
              파일 전체: {ours}
            </button>
            <button disabled={busy} onClick={() => onResolve(file!, { kind: "theirs" })}>
              파일 전체: {theirs}
            </button>
          </div>
        )}
        <button className="icon" onClick={onClose} title="닫기">
          ✕
        </button>
      </header>

      <div className="split">
        <ul className="file-list">
          {files.length === 0 && (
            <li className="muted pad">충돌이 모두 해결됐어요. ＋ 로 커밋하거나 '계속'을 누르세요.</li>
          )}
          {files.map((f) => (
            <li key={f} className={f === file ? "on" : ""} onClick={() => setFile(f)}>
              <span className="chip k-conflict">!</span>
              <span className="path">{f}</span>
            </li>
          ))}
        </ul>

        <div className="diff-body conflict-body">
          {error && <p className="note warn">{error}</p>}
          {data?.binary && (
            <div className="pad row">
              <p className="muted">바이너리 파일이라 내용을 비교할 수 없어요. 한쪽을 고르세요.</p>
              <button disabled={busy} onClick={() => onResolve(file!, { kind: "ours" })}>
                {ours}
              </button>
              <button disabled={busy} onClick={() => onResolve(file!, { kind: "theirs" })}>
                {theirs}
              </button>
            </div>
          )}
          {data &&
            !data.binary &&
            segments.map((s, i) => {
              if (s.kind === "text")
                return (
                  <pre key={i} className="ctx">
                    {s.text}
                  </pre>
                );
              const n = ++blockNo;
              const pick = picks[n];
              const choose = (p: Pick) => setPicks((ps) => Object.assign([...ps], { [n]: p }));
              return (
                <div key={i} className={`block ${pick ? "picked" : ""}`}>
                  <div className="block-head">
                    <span>
                      충돌 {n + 1} / {total}
                    </span>
                    <span className="row">
                      {(["ours", "theirs", "both"] as const).map((p) => (
                        <button key={p} className={pick === p ? "on" : ""} onClick={() => choose(p)}>
                          {p === "ours" ? ours : p === "theirs" ? theirs : "둘 다"}
                        </button>
                      ))}
                    </span>
                  </div>
                  <div className="sides">
                    <pre className={`side ours ${pick === "ours" || pick === "both" ? "keep" : pick ? "drop" : ""}`}>
                      <em>{ours}</em>
                      {s.ours || "(비어 있음)"}
                    </pre>
                    <pre
                      className={`side theirs ${pick === "theirs" || pick === "both" ? "keep" : pick ? "drop" : ""}`}
                    >
                      <em>
                        {theirs} {s.theirsLabel && `· ${s.theirsLabel}`}
                      </em>
                      {s.theirs || "(비어 있음)"}
                    </pre>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {data && !data.binary && total > 0 && (
        <footer className="conflict-foot">
          <span className="muted">
            충돌 {total}개 중 {chosen}개 선택
          </span>
          <button
            className="primary"
            disabled={busy || chosen < total}
            onClick={() => onResolve(file!, { kind: "content", text: resolveText(segments, picks) })}
          >
            이 파일 해결 완료
          </button>
        </footer>
      )}
    </section>
  );
}
