import { useEffect, useMemo, useRef, useState } from "react";
import type { FileDiff } from "../types";

interface Props {
  title: string;
  /** `null` while loading. */
  files: FileDiff[] | null;
  error: string | null;
  initialPath?: string;
  onClose(): void;
}

const STATUS: Record<string, string> = {
  added: "A",
  untracked: "U",
  deleted: "D",
  renamed: "R",
  copied: "C",
  typechange: "T",
  conflicted: "!",
  modified: "M",
};

const MIN_H = 160;

/** Bottom sheet under the graph: file list on the left, unified diff on the right. */
export function DiffSheet({ title, files, error, initialPath, onClose }: Props) {
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.45));
  const drag = useRef<{ y: number; h: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => setPath(initialPath), [initialPath]);

  const current = useMemo(() => files?.find((f) => f.path === path) ?? files?.[0], [files, path]);
  const totals = useMemo(
    () => (files ?? []).reduce((t, f) => ({ add: t.add + f.additions, del: t.del + f.deletions }), { add: 0, del: 0 }),
    [files],
  );

  useEffect(() => body.current?.scrollTo(0, 0), [current]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "Escape") onClose();
      if ((e.key === "]" || e.key === "[") && files?.length && current) {
        const i = files.indexOf(current) + (e.key === "]" ? 1 : -1);
        setPath(files[(i + files.length) % files.length].path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files, current, onClose]);

  return (
    <section className="diff-sheet" style={{ height }}>
      <div
        className="grip"
        title="끌어서 높이 조절"
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, h: height };
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          const max = window.innerHeight - 140;
          setHeight(Math.min(max, Math.max(MIN_H, drag.current.h + drag.current.y - e.clientY)));
        }}
        onPointerUp={() => (drag.current = null)}
      />
      <header>
        <div className="title">
          <span className="eyebrow">변경 내용</span>
          <b>{title}</b>
          {files && (
            <span className="muted">
              파일 {files.length}개 · <span className="add">+{totals.add}</span>{" "}
              <span className="del">−{totals.del}</span>
            </span>
          )}
        </div>
        <span className="muted keys">[ ] 파일 이동 · Esc 닫기</span>
        <button className="icon" onClick={onClose} title="닫기 (Esc)">
          ✕
        </button>
      </header>

      <div className="split">
        <ul className="file-list">
          {!files && !error && <li className="muted pad">불러오는 중…</li>}
          {files?.length === 0 && <li className="muted pad">변경 없음</li>}
          {files?.map((f) => (
            <li
              key={f.path}
              className={f === current ? "on" : ""}
              onClick={() => setPath(f.path)}
              title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
            >
              <span className={`chip k-${f.status}`}>{STATUS[f.status] ?? "M"}</span>
              <span className="path">{f.path}</span>
              <span className="stat">
                {f.additions > 0 && <span className="add">+{f.additions}</span>}
                {f.deletions > 0 && <span className="del">−{f.deletions}</span>}
              </span>
            </li>
          ))}
        </ul>

        <div className="diff-body" ref={body}>
          {error && <p className="note warn">{error}</p>}
          {current && <FileView file={current} />}
        </div>
      </div>
    </section>
  );
}

function FileView({ file }: { file: FileDiff }) {
  if (file.binary) return <p className="muted pad">바이너리 파일이라 내용을 표시하지 않아요.</p>;
  if (file.hunks.length === 0) return <p className="muted pad">내용 변경 없음 (권한·이름만 바뀜)</p>;
  return (
    <table className="diff">
      <tbody>
        {file.oldPath && (
          <tr className="hunk">
            <td colSpan={4}>
              {file.oldPath} → {file.path}
            </td>
          </tr>
        )}
        {file.hunks.map((h, i) => (
          <HunkRows key={i} header={h.header} lines={h.lines} />
        ))}
        {file.truncated && (
          <tr className="hunk">
            <td colSpan={4}>… 너무 길어서 일부만 표시했어요</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function HunkRows({ header, lines }: { header: string; lines: FileDiff["hunks"][number]["lines"] }) {
  return (
    <>
      <tr className="hunk">
        <td colSpan={4}>{header}</td>
      </tr>
      {lines.map((l, i) => (
        <tr key={i} className={l.kind === "+" ? "ins" : l.kind === "-" ? "rem" : ""}>
          <td className="no">{l.old ?? ""}</td>
          <td className="no">{l.new ?? ""}</td>
          <td className="sign">{l.kind === " " ? "" : l.kind === "-" ? "−" : "+"}</td>
          <td className="code">{l.text}</td>
        </tr>
      ))}
    </>
  );
}
