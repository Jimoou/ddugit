import type { FileDiff } from "../types";
import { t } from "../i18n";

/** Files grouped by folder, folders in path order (files at the root first). */
export function byFolder(files: FileDiff[]): { dir: string; files: FileDiff[] }[] {
  const groups = new Map<string, FileDiff[]>();
  for (const f of files) {
    const cut = f.path.lastIndexOf("/");
    const dir = cut < 0 ? "" : f.path.slice(0, cut + 1);
    groups.set(dir, [...(groups.get(dir) ?? []), f]);
  }
  return [...groups]
    .sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b)))
    .map(([dir, files]) => ({ dir, files }));
}

/**
 * "Changed files" used by the commit and stash panels: grouped by folder,
 * each with its size as a +/− bar; clicking a file opens its diff.
 */
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
  const big = Math.max(1, ...(files ?? []).map((f) => f.additions + f.deletions));
  const add = files?.reduce((n, f) => n + f.additions, 0) ?? 0;
  const del = files?.reduce((n, f) => n + f.deletions, 0) ?? 0;
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
      {files &&
        byFolder(files).map((g) => (
          <ul key={g.dir}>
            {g.dir && <li className="dir">{g.dir}</li>}
            {g.files.map((f) => (
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
                <span className="path">{f.path.slice(g.dir.length)}</span>
                <span className="bar" aria-hidden>
                  <i className="add" style={{ width: `${(f.additions / big) * 100}%` }} />
                  <i className="del" style={{ width: `${(f.deletions / big) * 100}%` }} />
                </span>
                <span className="stat">
                  {f.additions > 0 && <span className="add">+{f.additions}</span>}
                  {f.deletions > 0 && <span className="del">−{f.deletions}</span>}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
