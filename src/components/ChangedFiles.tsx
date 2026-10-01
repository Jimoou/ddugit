import type { FileDiff } from "../types";
import { t } from "../i18n";

/** "Changed files" list used by the commit and stash panels; clicking a file opens its diff. */
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
  return (
    <section className="changed">
      <h3>
        {t("files.changed")} <span className="muted">{files ? files.length : "…"}</span>
      </h3>
      <ul>
        {files?.map((f) => (
          <li
            key={f.path}
            onClick={() => onOpen(f.path)}
            onContextMenu={(e) => {
              if (!onMenu) return;
              e.preventDefault();
              onMenu(f.path, e.clientX, e.clientY);
            }}
            title={t("files.openDiff")}
          >
            <span className={`chip k-${f.status}`}>{f.status[0].toUpperCase()}</span>
            <span className="path">{f.path}</span>
            <span className="stat">
              {f.additions > 0 && <span className="add">+{f.additions}</span>}
              {f.deletions > 0 && <span className="del">−{f.deletions}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
