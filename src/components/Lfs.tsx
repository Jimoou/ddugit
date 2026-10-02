// Git LFS in the sidebar (what is tracked, what isn't downloaded, turning it
// on) and in diffs (the object a pointer stands for, instead of its hashes).

import { t } from "../i18n";
import { fmtBytes, type LfsPointer, lfsChange } from "../lfs";
import type { FileDiff, LfsStatus } from "../types";
import { Icon } from "./Icon";
import { SideSection } from "./Sidebar";

const INSTALL_PAGE = "https://git-lfs.com";

export function LfsSection(p: {
  status: LfsStatus | null;
  busy: boolean;
  onTrack(): void;
  onUntrack(pattern: string): void;
  onTurnOn(): void;
  onPull(): void;
  onOpenUrl(url: string): void;
}) {
  const s = p.status;
  // Only where it matters: the repository uses LFS, or LFS is here to start using.
  if (!s || (!s.version && s.patterns.length === 0)) return null;
  return (
    <SideSection
      id="lfs"
      className="lfs"
      title={t("lfs.title")}
      count={s.patterns.length}
      actions={
        s.version && (
          <button className="h3-add" title={t("lfs.track")} aria-label={t("lfs.track")} onClick={p.onTrack}>
            <Icon name="plus" size={12} />
          </button>
        )
      }
    >
      {!s.version ? (
        <p className="side-note">
          {t("lfs.notInstalled")}{" "}
          <button className="link" onClick={() => p.onOpenUrl(INSTALL_PAGE)}>
            {t("lfs.install.page")}
          </button>
        </p>
      ) : (
        s.patterns.length > 0 &&
        !s.filters && (
          <p className="side-note">
            {t("lfs.off")}{" "}
            <button disabled={p.busy} onClick={p.onTurnOn}>
              {t("lfs.turnOn")}
            </button>
          </p>
        )
      )}
      {s.missing > 0 && (
        <p className="side-note lit" title={s.missingFiles.join("\n")}>
          {t("lfs.missing", { n: s.missing })}{" "}
          <button disabled={p.busy || !s.version} onClick={p.onPull}>
            <Icon name="arrowDown" size={11} /> {t("lfs.pull")}
          </button>
        </p>
      )}
      {s.patterns.length === 0 ? (
        <p className="side-note muted">{t("lfs.none")}</p>
      ) : (
        <ul>
          {s.patterns.map((pattern) => (
            <li key={pattern} title={pattern}>
              <span className="name mono">{pattern}</span>
              {s.version && (
                <button
                  className="icon"
                  title={t("lfs.untrack")}
                  aria-label={`${t("lfs.untrack")} ${pattern}`}
                  disabled={p.busy}
                  onClick={() => p.onUntrack(pattern)}
                >
                  <Icon name="close" size={11} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SideSection>
  );
}

function Side({ label, obj }: { label: string; obj: LfsPointer | null }) {
  return (
    <div className="lfs-side">
      <span className="muted">{label}</span>
      {obj ? (
        <>
          <b>{fmtBytes(obj.size)}</b>
          <code title={obj.oid}>{obj.oid.slice(0, 12)}</code>
        </>
      ) : (
        <span className="muted">{t("diff.lfs.none")}</span>
      )}
    </div>
  );
}

/** A diff of LFS pointers as the objects they stand for; null for any other file. */
export function LfsDiff({ file }: { file: FileDiff }) {
  const change = lfsChange(file);
  if (!change) return null;
  return (
    <div className="lfs-diff">
      <div className="eyebrow">{t("diff.lfs")}</div>
      <div className="lfs-sides">
        <Side label={t("diff.lfs.before")} obj={change.before} />
        <Icon name="arrowRight" size={12} />
        <Side label={t("diff.lfs.after")} obj={change.after} />
      </div>
      <p className="muted small">{t("diff.lfs.note")}</p>
    </div>
  );
}
