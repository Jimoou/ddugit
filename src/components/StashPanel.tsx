import { fmtTime, stashTitle } from "../format";
import type { FileDiff, StashInfo } from "../types";
import { ChangedFiles } from "./ChangedFiles";
import { t } from "../i18n";

interface Props {
  stash: StashInfo;
  /** Changed tracked files; `null` while loading. */
  files: FileDiff[] | null;
  busy: boolean;
  onClose(): void;
  onSelectBase(): void;
  onOpenFile(path: string): void;
  onPop(): void;
  onApply(): void;
  onDrop(): void;
}

export function StashPanel({ stash, files, busy, onClose, onSelectBase, onOpenFile, onPop, onApply, onDrop }: Props) {
  return (
    <aside className="panel stash-panel" style={{ ["--accent" as string]: "var(--amber)" }}>
      <header>
        <div>
          <div className="eyebrow">
            {t("stashPanel.eyebrow")} · stash@{`{${stash.index}}`}
          </div>
          <h2>{stashTitle(stash.message)}</h2>
        </div>
        <button className="icon" onClick={onClose} title={t("common.closeEsc")}>
          ✕
        </button>
      </header>

      <dl className="meta">
        <dt>{t("stashPanel.time")}</dt>
        <dd>{fmtTime(stash.time, false)}</dd>
        <dt>{t("stashPanel.base")}</dt>
        <dd>
          <code className="sha link" onClick={onSelectBase}>
            {stash.base.slice(0, 7)}
          </code>
        </dd>
      </dl>

      <ChangedFiles files={files} onOpen={onOpenFile} />
      <p className="tip">{t("stashPanel.tip")}</p>

      <div className="actions">
        <button className="primary" disabled={busy} onClick={onPop}>
          {t("stashPanel.pop")}
        </button>
        <button disabled={busy} onClick={onApply}>
          {t("stashPanel.apply")}
        </button>
        <button className="danger ghost" disabled={busy} onClick={onDrop}>
          {t("stashPanel.drop")}
        </button>
      </div>
    </aside>
  );
}
