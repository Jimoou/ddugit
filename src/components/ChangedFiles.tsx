import type { FileDiff } from "../types";
import { t } from "../i18n";

/** "변경 파일" list used by the commit and stash panels; clicking a file opens its diff. */
export function ChangedFiles({ files, onOpen }: { files: FileDiff[] | null; onOpen(path: string): void }) {
  return (
    <section className="changed">
      <h3>
        {t("files.changed")} <span className="muted">{files ? files.length : "…"}</span>
      </h3>
      <ul>
        {files?.map((f) => (
          <li key={f.path} onClick={() => onOpen(f.path)} title={t("files.openDiff")}>
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
