import { useEffect, useState } from "react";
import { api } from "../api";
import { fmtTime } from "../format";
import { t } from "../i18n";
import type { CommitInfo, FileDiff, RefInfo } from "../types";
import { Icon } from "./Icon";

/** Files listed on the card; the rest are counted. */
const MAX_FILES = 5;
/** Lines of the message body shown under the summary. */
const BODY_LINES = 3;
const WIDTH = 300;

/** The message without its summary line: the first few non-empty lines. */
export function bodyPreview(message: string, lines = BODY_LINES): string[] {
  return message
    .split("\n")
    .slice(1)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, lines);
}

/**
 * A commit at a glance, shown while the pointer rests on its star: summary,
 * the start of the body, who and when, and the files it touched with their size.
 */
export function PeekCard(p: {
  path: string;
  commit: CommitInfo;
  refs: RefInfo[];
  /** Star position in the graph area, and the area's width to stay inside it. */
  at: { x: number; y: number };
  width: number;
}) {
  const { path, commit } = p;
  const [loaded, setLoaded] = useState<{ id: string; files: FileDiff[] } | null>(null);
  useEffect(() => {
    let live = true;
    api.commitDiff(path, commit.id).then(
      (files) => live && setLoaded({ id: commit.id, files }),
      () => live && setLoaded({ id: commit.id, files: [] }),
    );
    return () => {
      live = false;
    };
  }, [path, commit.id]);
  const files = loaded?.id === commit.id ? loaded.files : null;
  const body = bodyPreview(commit.message);
  const big = Math.max(1, ...(files ?? []).map((f) => f.additions + f.deletions));
  // Beside the star, flipped to its left near the right edge.
  const left = p.at.x + 18 + WIDTH > p.width ? p.at.x - 18 - WIDTH : p.at.x + 18;
  return (
    <div className="peek" style={{ left: Math.max(8, left), top: Math.max(8, p.at.y - 24), width: WIDTH }} aria-hidden>
      <div className="peek-summary">{commit.summary}</div>
      {body.length > 0 && (
        <div className="peek-body">
          {body.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      )}
      <div className="peek-meta muted">
        <code>{commit.id.slice(0, 7)}</code> · {commit.author} · {fmtTime(commit.time, false)}
        {p.refs
          .filter((r) => r.kind === "pr")
          .map((r) => (
            <span key={r.name} className="peek-pr">
              <Icon name="pull" size={11} /> {r.name}
            </span>
          ))}
      </div>
      {files === null && <div className="peek-files muted">{t("diff.loading")}</div>}
      {files && files.length > 0 && (
        <ul className="peek-files">
          {files.slice(0, MAX_FILES).map((f) => (
            <li key={f.path}>
              <span className="path" title={f.path}>
                {f.path}
              </span>
              <span className="bar">
                <i className="add" style={{ width: `${(f.additions / big) * 100}%` }} />
                <i className="del" style={{ width: `${(f.deletions / big) * 100}%` }} />
              </span>
              <span className="num">
                <span className="add">+{f.additions}</span> <span className="del">−{f.deletions}</span>
              </span>
            </li>
          ))}
          {files.length > MAX_FILES && <li className="muted">{t("peek.more", { n: files.length - MAX_FILES })}</li>}
        </ul>
      )}
    </div>
  );
}
