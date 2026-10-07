import { Icon } from "./Icon";
import { LfsDiff } from "./Lfs";
import { lfsChange } from "../lfs";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { offsets, useVisibleRows } from "./virtual";
import type { FileDiff } from "../types";
import { t } from "../i18n";
import { Segmented } from "./Segmented";
import { useDialog } from "./useDialog";
import { Rich } from "../i18n/Rich";
import { isOnScreen, isTypingTarget } from "../keys";

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

interface Staging {
  scope: "unstaged" | "staged";
  busy: boolean;
  onScope(scope: Staging["scope"]): void;
  /** With `lines`, only those lines (indices into the hunk's lines) move. */
  onHunk(file: string, hunk: number, lines?: number[]): void;
  /** Throw an unstaged hunk (or `lines` of it) away; the caller confirms. */
  onDiscard(file: string, hunk: number, lines?: number[]): void;
  /** Stage (or, in the staged tab, unstage) the whole file. */
  onFile(file: string): void;
  /** Stage (or unstage) every file in the tab. */
  onAll(): void;
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
/** File list row height, px (fixed in CSS). */
const FILE_H = 24;

/** Bottom sheet under the graph: file list on the left, unified diff on the right. */
export function DiffSheet({ title, files, error, initialPath, stage, onClose }: Props) {
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [height, setHeight] = useState(() => Math.round(window.innerHeight * 0.45));
  const drag = useRef<{ y: number; h: number } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const fileTops = useMemo(() => offsets((files ?? []).map(() => FILE_H)), [files]);
  const fileRows = useVisibleRows(list, fileTops);

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
      // Hidden tabs keep their sheets mounted; only the one on screen takes keys.
      if (isTypingTarget(e.target) || !isOnScreen(body.current)) return;
      if ((e.key === "]" || e.key === "[") && files?.length && current) {
        const i = files.indexOf(current) + (e.key === "]" ? 1 : -1);
        setPath(files[(i + files.length) % files.length].path);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [files, current]);

  const sheet = useDialog(onClose, false);
  return (
    <section className="diff-sheet" style={{ height }} {...sheet}>
      <div
        className="grip"
        title={t("diff.resize")}
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
          <h2 className="dialog-title">{t("diff.title")}</h2>
          <b>{title}</b>
          {files && (
            <span className="muted">
              {t("diff.files", { n: files.length })} · <span className="add">+{totals.add}</span>{" "}
              <span className="del">−{totals.del}</span>
            </span>
          )}
        </div>
        {stage && (
          <Segmented
            role="tablist"
            label={t("diff.title")}
            value={stage.scope}
            onChange={stage.onScope}
            options={[
              { value: "unstaged", label: t("diff.tab.unstaged") },
              { value: "staged", label: t("diff.tab.staged") },
            ]}
          />
        )}
        {stage && (
          <button disabled={stage.busy || !files?.length} onClick={stage.onAll}>
            {t(stage.scope === "unstaged" ? "diff.stageAll" : "diff.unstageAll")}
          </button>
        )}
        <span className="muted keys">
          <Rich k="diff.keys" />
        </span>
        <button className="icon" onClick={onClose} title={t("common.closeEsc")}>
          <Icon name="close" />
        </button>
      </header>

      <div className="split">
        <ul className="file-list" ref={list}>
          {!files && !error && <li className="muted pad">{t("diff.loading")}</li>}
          {files?.length === 0 && <li className="muted pad">{t("diff.none")}</li>}
          {fileRows.start > 0 && <li className="gap" style={{ height: fileTops[fileRows.start] }} aria-hidden />}
          {files?.slice(fileRows.start, fileRows.end).map((f) => (
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
          {files && fileRows.end < files.length && (
            <li className="gap" style={{ height: fileTops[files.length] - fileTops[fileRows.end] }} aria-hidden />
          )}
        </ul>

        <div className="diff-body" ref={body}>
          {error && <p className="note warn">{error}</p>}
          {current && stage && (
            <div className="file-bar">
              <span className="path">{current.path}</span>
              <button disabled={stage.busy} onClick={() => stage.onFile(current.path)}>
                <Icon name={stage.scope === "unstaged" ? "plus" : "minus"} size={12} />{" "}
                {t(stage.scope === "unstaged" ? "diff.stageFile" : "diff.unstageFile")}
              </button>
            </div>
          )}
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

/** Row heights, px (fixed in CSS, so long diffs can draw only the rows on screen). */
const LINE_H = 19;
const HEAD_H = 32;

/** One table row: a note (rename, cut short), a hunk header, or a line of a hunk. */
type Row =
  | { kind: "rename" }
  | { kind: "truncated" }
  | { kind: "hunk"; hunk: number }
  | { kind: "line"; hunk: number; line: number };

function rowsOf(file: FileDiff): Row[] {
  const rows: Row[] = file.oldPath ? [{ kind: "rename" }] : [];
  file.hunks.forEach((h, hunk) => {
    rows.push({ kind: "hunk", hunk });
    for (let line = 0; line < h.lines.length; line++) rows.push({ kind: "line", hunk, line });
  });
  if (file.truncated) rows.push({ kind: "truncated" });
  return rows;
}

function FileView({ file, stage }: { file: FileDiff; stage?: Staging }) {
  // Picks belong to the diff they were made on; a reloaded diff starts clean.
  const [picked, setPicked] = useState<{ file: FileDiff; pick: LinePick | null }>({ file, pick: null });
  const pick = picked.file === file ? picked.pick : null;
  const setPick = (next: (p: LinePick | null) => LinePick | null) =>
    setPicked((cur) => ({ file, pick: next(cur.file === file ? cur.pick : null) }));
  const rows = useMemo(() => rowsOf(file), [file]);
  const tops = useMemo(() => offsets(rows.map((r) => (r.kind === "line" ? LINE_H : HEAD_H))), [rows]);
  const table = useRef<HTMLTableElement>(null);
  const { start, end } = useVisibleRows(table, tops, ".diff-body");
  const pickedSet = useMemo(() => new Set(pick?.lines), [pick]);

  if (file.binary) return <p className="muted pad">{t("diff.binary")}</p>;
  if (lfsChange(file)) return <LfsDiff file={file} />;
  if (file.hunks.length === 0) return <p className="muted pad">{t("diff.modeOnly")}</p>;

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

  const staging = stage?.scope === "unstaged";
  const row = (r: Row, i: number) => {
    if (r.kind === "rename")
      return (
        <tr key={i} className="hunk">
          <td colSpan={4}>
            {file.oldPath} → {file.path}
          </td>
        </tr>
      );
    if (r.kind === "truncated")
      return (
        <tr key={i} className="hunk">
          <td colSpan={4}>{t("diff.truncated")}</td>
        </tr>
      );
    const lines = pick && pick.hunk === r.hunk ? pick.lines : [];
    const sorted = lines.length ? [...lines].sort((a, b) => a - b) : undefined;
    if (r.kind === "hunk")
      return (
        <tr key={i} className="hunk">
          <td colSpan={4}>
            <span>{file.hunks[r.hunk].header}</span>
            {stage && (
              <span className="hunk-btns">
                <button
                  className="hunk-btn"
                  disabled={stage.busy}
                  onClick={() => stage.onHunk(file.path, r.hunk, sorted)}
                >
                  <Icon name={stage.scope === "unstaged" ? "plus" : "minus"} size={12} />{" "}
                  {lines.length
                    ? t(staging ? "diff.stageLines" : "diff.unstageLines", { n: lines.length })
                    : t(staging ? "diff.stageHunk" : "diff.unstageHunk")}
                </button>
                {staging && (
                  <button
                    className="hunk-btn danger ghost"
                    disabled={stage.busy}
                    onClick={() => stage.onDiscard(file.path, r.hunk, sorted)}
                  >
                    {lines.length ? t("diff.discardLines", { n: lines.length }) : t("diff.discardHunk")}
                  </button>
                )}
              </span>
            )}
          </td>
        </tr>
      );
    const l = file.hunks[r.hunk].lines[r.line];
    const change = l.kind !== " ";
    // Click a changed line's gutter to pick it (Shift: range).
    const pickProps =
      stage && change
        ? { onClick: (e: MouseEvent) => toggle(r.hunk, r.line, e.shiftKey), title: t("diff.pickLine") }
        : {};
    const isPicked = pick?.hunk === r.hunk && pickedSet.has(r.line);
    return (
      <tr key={i} className={`${l.kind === "+" ? "ins" : l.kind === "-" ? "rem" : ""} ${isPicked ? "picked" : ""}`}>
        <td className="no" {...pickProps}>
          {l.old ?? ""}
        </td>
        <td className="no" {...pickProps}>
          {l.new ?? ""}
        </td>
        <td className="sign" {...pickProps}>
          {l.kind === " " ? "" : l.kind === "-" ? "−" : "+"}
        </td>
        <td className="code">{l.text}</td>
      </tr>
    );
  };

  return (
    <table className={`diff ${stage ? "pickable" : ""}`} ref={table}>
      <tbody>
        {start > 0 && <tr className="gap" style={{ height: tops[start] }} aria-hidden />}
        {rows.slice(start, end).map((r, i) => row(r, start + i))}
        {end < rows.length && <tr className="gap" style={{ height: tops[rows.length] - tops[end] }} aria-hidden />}
      </tbody>
    </table>
  );
}
