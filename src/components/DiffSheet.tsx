import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { FileDiff } from "../types";

interface Props {
  title: string;
  /** `null` while loading. */
  files: FileDiff[] | null;
  error: string | null;
  initialPath?: string;
  /** Present for working-tree diffs: switch scope and (un)stage single hunks. */
  stage?: Staging;
  onClose(): void;
}

export interface Staging {
  scope: "unstaged" | "staged";
  busy: boolean;
  onScope(scope: Staging["scope"]): void;
  /** With `lines`, only those lines (indices into the hunk's lines) move. */
  onHunk(file: string, hunk: number, lines?: number[]): void;
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
export function DiffSheet({ title, files, error, initialPath, stage, onClose }: Props) {
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.45));
  const drag = useRef<{ y: number; h: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);

  // A new file asked for from outside (e.g. the composer) wins over the user's pick.
  const [askedPath, setAskedPath] = useState(initialPath);
  if (askedPath !== initialPath) {
    setAskedPath(initialPath);
    setPath(initialPath);
  }

  const current = useMemo(() => files?.find((f) => f.path === path) ?? files?.[0], [files, path]);
  const totals = useMemo(
    () => (files ?? []).reduce((t, f) => ({ add: t.add + f.additions, del: t.del + f.deletions }), { add: 0, del: 0 }),
    [files],
  );

  // Block body: an effect must return nothing or a cleanup, and newer
  // Chromium (WebView2 included) returns a Promise from scrollTo.
  useEffect(() => {
    body.current?.scrollTo(0, 0);
  }, [current]);

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
        {stage && (
          <div className="scope-tabs" role="tablist">
            {(["unstaged", "staged"] as const).map((sc) => (
              <button
                key={sc}
                role="tab"
                aria-selected={stage.scope === sc}
                className={stage.scope === sc ? "on" : ""}
                onClick={() => stage.onScope(sc)}
              >
                {sc === "unstaged" ? "변경" : "스테이지됨"}
              </button>
            ))}
          </div>
        )}
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
          {current && <FileView file={current} stage={stage} />}
        </div>
      </div>
    </section>
  );
}

/** Lines picked for line-level staging; one hunk at a time, as the backend applies them. */
interface LinePick {
  hunk: number;
  lines: number[];
  /** Last clicked line, for Shift+click ranges. */
  anchor: number;
}

function FileView({ file, stage }: { file: FileDiff; stage?: Staging }) {
  // Picks belong to the diff they were made on; a reloaded diff starts clean.
  const [picked, setPicked] = useState<{ file: FileDiff; pick: LinePick | null }>({ file, pick: null });
  const pick = picked.file === file ? picked.pick : null;
  const setPick = (next: (p: LinePick | null) => LinePick | null) =>
    setPicked((cur) => ({ file, pick: next(cur.file === file ? cur.pick : null) }));

  if (file.binary) return <p className="muted pad">바이너리 파일이라 내용을 표시하지 않아요.</p>;
  if (file.hunks.length === 0) return <p className="muted pad">내용 변경 없음 (권한·이름만 바뀜)</p>;

  const toggle = (hunk: number, line: number, range: boolean) =>
    setPick((p) => {
      const lines = file.hunks[hunk].lines;
      if (p?.hunk === hunk && range) {
        const [a, b] = [Math.min(p.anchor, line), Math.max(p.anchor, line)];
        const span = Array.from({ length: b - a + 1 }, (_, i) => a + i).filter((i) => lines[i].kind !== " ");
        return { ...p, lines: [...new Set([...p.lines, ...span])], anchor: line };
      }
      const prev = p?.hunk === hunk ? p.lines : [];
      const next = prev.includes(line) ? prev.filter((i) => i !== line) : [...prev, line];
      return next.length ? { hunk, lines: next, anchor: line } : null;
    });

  return (
    <table className={`diff ${stage ? "pickable" : ""}`}>
      <tbody>
        {file.oldPath && (
          <tr className="hunk">
            <td colSpan={4}>
              {file.oldPath} → {file.path}
            </td>
          </tr>
        )}
        {file.hunks.map((h, i) => {
          const picked = pick?.hunk === i ? pick.lines : [];
          const verb = stage?.scope === "unstaged" ? "스테이지" : "스테이지에서 내리기";
          return (
            <HunkRows
              key={i}
              header={h.header}
              lines={h.lines}
              picked={picked}
              onPick={stage && ((line, range) => toggle(i, line, range))}
              action={
                stage && (
                  <button
                    className="hunk-btn"
                    disabled={stage.busy}
                    onClick={() =>
                      stage.onHunk(file.path, i, picked.length ? [...picked].sort((a, b) => a - b) : undefined)
                    }
                  >
                    {stage.scope === "unstaged" ? "＋ " : "− "}
                    {picked.length ? `선택한 ${picked.length}줄 ${verb}` : `이 부분 ${verb}`}
                  </button>
                )
              }
            />
          );
        })}
        {file.truncated && (
          <tr className="hunk">
            <td colSpan={4}>… 너무 길어서 일부만 표시했어요</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

function HunkRows({
  header,
  lines,
  action,
  picked = [],
  onPick,
}: {
  header: string;
  lines: FileDiff["hunks"][number]["lines"];
  action?: ReactNode;
  picked?: number[];
  /** Click a changed line's gutter to pick it (Shift: range). */
  onPick?(line: number, range: boolean): void;
}) {
  return (
    <>
      <tr className="hunk">
        <td colSpan={4}>
          <span>{header}</span>
          {action}
        </td>
      </tr>
      {lines.map((l, i) => {
        const change = l.kind !== " ";
        const pick =
          onPick && change
            ? {
                onClick: (e: MouseEvent) => onPick(i, e.shiftKey),
                title: "클릭해서 이 줄만 고르기 (Shift: 범위)",
              }
            : {};
        return (
          <tr
            key={i}
            className={`${l.kind === "+" ? "ins" : l.kind === "-" ? "rem" : ""} ${picked.includes(i) ? "picked" : ""}`}
          >
            <td className="no" {...pick}>
              {l.old ?? ""}
            </td>
            <td className="no" {...pick}>
              {l.new ?? ""}
            </td>
            <td className="sign" {...pick}>
              {l.kind === " " ? "" : l.kind === "-" ? "−" : "+"}
            </td>
            <td className="code">{l.text}</td>
          </tr>
        );
      })}
    </>
  );
}
