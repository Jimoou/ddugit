import { useMemo, useRef } from "react";
import { offsets, useVisibleRows } from "./virtual";
import type { FileDiff } from "../types";
import { t } from "../i18n";

/** Files grouped by folder, folders in path order (files at the root first). */
export function byFolder(files: FileDiff[]): { dir: string; files: FileDiff[] }[] {
  const groups = new Map<string, FileDiff[]>();
  for (const f of files) {
    const cut = f.path.lastIndexOf("/");
    const dir = cut < 0 ? "" : f.path.slice(0, cut + 1);
    const list = groups.get(dir);
    if (list) list.push(f);
    else groups.set(dir, [f]);
  }
  return [...groups]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([dir, files]) => ({ dir, files }));
}

/**
 * "Changed files" used by the commit and stash panels: grouped by folder,
 * each with its size as a +/− bar; clicking a file opens its diff.
 */
/** Row heights, px (fixed in CSS): a commit touching thousands of files draws only the rows on screen. */
const DIR_H = 21;
const FILE_H = 24;

export function ChangedFiles({
  files,
  onOpen,
  onMenu,
}: {
  files: FileDiff[] | null;
  onOpen(path: string): void;
  /** Right-click on a file (e.g. restore it as of this commit). */
  onMenu?(path: string, x: number, y: number): void;
}) {
  const big = (files ?? []).reduce((m, f) => Math.max(m, f.additions + f.deletions), 1);
  const add = files?.reduce((n, f) => n + f.additions, 0) ?? 0;
  const del = files?.reduce((n, f) => n + f.deletions, 0) ?? 0;
  // One list of folder headings and files, in folder order.
  const rows = useMemo(
    () =>
      byFolder(files ?? []).flatMap((g) => [
        ...(g.dir ? [{ dir: g.dir, file: null }] : []),
        ...g.files.map((file) => ({ dir: g.dir, file })),
      ]),
    [files],
  );
  const tops = useMemo(() => offsets(rows.map((r) => (r.file ? FILE_H : DIR_H))), [rows]);
  const list = useRef<HTMLUListElement>(null);
  const { start, end } = useVisibleRows(list, tops, ".panel");
  return (
    <section className="changed">
      <h3>
        {t("files.changed")} <span className="muted">{files ? files.length : "…"}</span>
        {files && files.length > 0 && (
          <span className="total">
            <span className="add">+{add}</span> <span className="del">−{del}</span>
          </span>
        )}
      </h3>
      <ul ref={list}>
        {start > 0 && <li className="gap" style={{ height: tops[start] }} aria-hidden />}
        {rows.slice(start, end).map(({ dir, file: f }) =>
          !f ? (
            <li key={dir} className="dir">
              {dir}
            </li>
          ) : (
            <li
              key={f.path}
              onClick={() => onOpen(f.path)}
              onContextMenu={(e) => {
                if (!onMenu) return;
                e.preventDefault();
                onMenu(f.path, e.clientX, e.clientY);
              }}
              title={`${f.path}\n${t("files.openDiff")}`}
            >
              <span className={`chip k-${f.status}`}>{f.status[0].toUpperCase()}</span>
              <span className="path">{f.path.slice(dir.length)}</span>
              <span className="bar" aria-hidden>
                <i className="add" style={{ width: `${(f.additions / big) * 100}%` }} />
                <i className="del" style={{ width: `${(f.deletions / big) * 100}%` }} />
              </span>
              <span className="stat">
                {f.additions > 0 && <span className="add">+{f.additions}</span>}
                {f.deletions > 0 && <span className="del">−{f.deletions}</span>}
              </span>
            </li>
          ),
        )}
        {end < rows.length && <li className="gap" style={{ height: tops[rows.length] - tops[end] }} aria-hidden />}
      </ul>
    </section>
  );
}
