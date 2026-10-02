import { Icon } from "./Icon";
import { LfsDiff } from "./Lfs";
import { lfsChange } from "../lfs";
import { type MouseEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import type { FileDiff } from "../types";
import { t } from "../i18n";

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
          <span className="eyebrow">{t("diff.title")}</span>
          <b>{title}</b>
          {files && (
            <span className="muted">
              {t("diff.files", { n: files.length })} · <span className="add">+{totals.add}</span>{" "}
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
                {sc === "unstaged" ? t("diff.tab.unstaged") : t("diff.tab.staged")}
              </button>
            ))}
          </div>
        )}
        <span className="muted keys">{t("diff.keys")}</span>
        <button className="icon" onClick={onClose} title={t("common.closeEsc")}>
          <Icon name="close" />
        </button>
      </header>

      <div className="split">
        <ul className="file-list">
          {!files && !error && <li className="muted pad">{t("diff.loading")}</li>}
          {files?.length === 0 && <li className="muted pad">{t("diff.none")}</li>}
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
          const staging = stage?.scope === "unstaged";
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
                    <Icon name={stage.scope === "unstaged" ? "plus" : "minus"} size={12} />{" "}
                    {picked.length
                      ? t(staging ? "diff.stageLines" : "diff.unstageLines", { n: picked.length })
                      : t(staging ? "diff.stageHunk" : "diff.unstageHunk")}
                  </button>
                )
              }
            />
          );
        })}
        {file.truncated && (
          <tr className="hunk">
            <td colSpan={4}>{t("diff.truncated")}</td>
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
                title: t("diff.pickLine"),
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
