import { useState } from "react";
import { Icon } from "./Icon";
import { fmtTime, stashTitle } from "../format";
import type { FileDiff, StashInfo, StashOptions } from "../types";
import { ChangedFiles } from "./ChangedFiles";
import { t } from "../i18n";
import { Modal } from "./Modal";

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
  onBranch(): void;
  onDrop(): void;
}

export function StashPanel(props: Props) {
  const { stash, files, busy, onClose, onSelectBase, onOpenFile, onPop, onApply, onBranch, onDrop } = props;
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
          <Icon name="close" />
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
        <button disabled={busy} onClick={onBranch}>
          {t("stash.branch")}
        </button>
        <button className="danger ghost" disabled={busy} onClick={onDrop}>
          {t("stashPanel.drop")}
        </button>
      </div>
    </aside>
  );
}

interface SaveProps {
  /** Files picked in the composer; `null`: every change. */
  count: number | null;
  /** Prefilled message (the composer's). */
  message: string;
  busy: boolean;
  onSave(message: string, options: StashOptions): void;
  onCancel(): void;
}

/** Asks how to stash: a message, whether new files go too, whether staged changes stay. */
export function StashSaveDialog({ count, message: initial, busy, onSave, onCancel }: SaveProps) {
  const [message, setMessage] = useState(initial);
  const [untracked, setUntracked] = useState(true);
  const [keepIndex, setKeepIndex] = useState(false);
  return (
    <Modal
      className="stash-save"
      title={t("stash.save.title")}
      onClose={onCancel}
      onSubmit={() => !busy && onSave(message.trim(), { untracked, keepIndex })}
      actions={
        <>
          <button type="button" onClick={onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={busy}>
            {t("stash.save.go")}
          </button>
        </>
      }
    >
      <p className="muted">{count === null ? t("stash.save.all") : t("stash.save.some", { n: count })}</p>
      <input
        className="text"
        autoFocus
        aria-label={t("stash.save.message")}
        placeholder={t("stash.save.message")}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <label className="check">
        <input type="checkbox" checked={untracked} onChange={(e) => setUntracked(e.target.checked)} />
        <span>{t("stash.save.untracked")}</span>
      </label>
      <label className="check">
        <input type="checkbox" checked={keepIndex} onChange={(e) => setKeepIndex(e.target.checked)} />
        <span>{t("stash.save.keepIndex")}</span>
      </label>
    </Modal>
  );
}
