import { useState } from "react";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { readStored, writeStored } from "../storage";
import type { CommitInfo, MergeMode } from "../types";
import { Modal } from "./Modal";
import { Segmented } from "./Segmented";

interface Props {
  source: string;
  target: string;
  sourceColor: string;
  targetColor: string;
  switchesBranch: boolean;
  /** `target` is behind `source`: a fast-forward just moves it. */
  canFastForward: boolean;
  dirty: number;
  /** Of those, changes to tracked files: a squash waits until there are none. */
  trackedDirty: number;
  busy: boolean;
  onCancel(): void;
  /** `message` is null for git's own (or for a squash, which commits nothing). */
  onConfirm(mode: MergeMode, message: string | null): void;
}

const MODES: { value: MergeMode; label: "merge.mode.commit" | "merge.mode.ff" | "merge.mode.squash" }[] = [
  { value: "commit", label: "merge.mode.commit" },
  { value: "fastForward", label: "merge.mode.ff" },
  { value: "squash", label: "merge.mode.squash" },
];

/** The last way of merging picked, offered first next time. */
const MODE_KEY = "ddugit.mergeMode";
const storedMode = (): MergeMode => {
  const m = readStored(MODE_KEY);
  return MODES.some((x) => x.value === m) ? (m as MergeMode) : "commit";
};

/**
 * The message a squash merge starts the composer with: the one commit's own,
 * or the source's name over the summaries of what it brings (oldest first).
 * `brought` is newest first, as the graph lists commits.
 */
export function squashMessage(source: string, brought: CommitInfo[]): string {
  const own = brought.filter((c) => c.parents.length < 2);
  if (own.length === 1) return own[0].message.trim();
  return [source, "", ...own.reverse().map((c) => `* ${c.summary}`)].join("\n");
}

export function MergeDialog(p: Props) {
  const [mode, setMode] = useState(storedMode);
  const [message, setMessage] = useState("");
  // A fast-forward makes no commit, and a squash leaves the commit to the composer.
  const makesCommit = mode === "commit" || (mode === "fastForward" && !p.canFastForward);
  const body = mode === "squash" ? "merge.body.squash" : makesCommit ? "merge.body" : "merge.body.ff";
  const blocked = mode === "squash" && p.trackedDirty > 0;
  const confirm = () => {
    if (blocked) return;
    writeStored(MODE_KEY, mode);
    p.onConfirm(mode, makesCommit && message.trim() ? message.trim() : null);
  };
  return (
    <Modal
      onClose={p.onCancel}
      title={t("merge.title")}
      actions={
        <>
          <button onClick={p.onCancel}>{t("common.cancel")}</button>
          <button className="primary" autoFocus disabled={p.busy || blocked} onClick={confirm}>
            {p.busy ? t("merge.going") : t(mode === "squash" ? "merge.go.squash" : "merge.go")}
          </button>
        </>
      }
    >
      <div className="merge-flow">
        <span className="chip-lg" style={{ ["--c" as string]: p.sourceColor }}>
          {p.source}
        </span>
        <span className="flow-arrow" aria-hidden>
          <i />
        </span>
        <span className="chip-lg" style={{ ["--c" as string]: p.targetColor }}>
          {p.target}
        </span>
      </div>
      <Segmented
        label={t("merge.mode")}
        value={mode}
        onChange={setMode}
        options={MODES.map((m) => ({ value: m.value, label: t(m.label) }))}
      />
      <p>
        <Rich k={body} vars={{ source: p.source, target: p.target }} />
      </p>
      {mode === "fastForward" && !p.canFastForward && <p className="note">{t("merge.ff.cannot")}</p>}
      {makesCommit && (
        <textarea
          className="merge-message"
          rows={2}
          aria-label={t("merge.message")}
          placeholder={t("merge.message")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      )}
      {p.switchesBranch && <p className="note">{t("merge.switch", { target: p.target })}</p>}
      {blocked ? (
        <p className="note warn">{t("merge.dirty.squash", { n: p.trackedDirty })}</p>
      ) : (
        p.dirty > 0 && <p className="note warn">{t("merge.dirty", { n: p.dirty })}</p>
      )}
    </Modal>
  );
}
