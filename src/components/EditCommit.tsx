// Touching up a past commit: its message, its author, or splitting it in two
// by files. Later commits are replayed on top (see `git/edit.rs`).

import { useState } from "react";
import { t } from "../i18n";
import type { CommitEdit, CommitInfo, FileDiff } from "../types";
import { Modal } from "./Modal";

export type EditMode = CommitEdit["kind"];

export function EditCommitDialog(p: {
  mode: EditMode;
  commit: CommitInfo;
  /** The commit's files, for splitting (null while loading). */
  files: FileDiff[] | null;
  /** Commits that will be rewritten (this one and the ones after it). */
  rewrites: number;
  /** Some of them are already pushed (a force push will be needed). */
  pushed: boolean;
  busy: boolean;
  onCancel(): void;
  onSubmit(edit: CommitEdit): void;
}) {
  const { commit } = p;
  const [message, setMessage] = useState(commit.message.trimEnd());
  const [name, setName] = useState(commit.author);
  const [email, setEmail] = useState(commit.email);
  const [first, setFirst] = useState<Set<string>>(new Set());
  const [firstMessage, setFirstMessage] = useState(commit.summary);
  const [secondMessage, setSecondMessage] = useState(commit.summary);

  const files = p.files ?? [];
  const edit: CommitEdit | null =
    p.mode === "reword"
      ? message.trim() && message.trim() !== commit.message.trim()
        ? { kind: "reword", message }
        : null
      : p.mode === "author"
        ? name.trim() && email.includes("@") && (name !== commit.author || email !== commit.email)
          ? { kind: "author", name, email }
          : null
        : first.size > 0 && first.size < files.length && firstMessage.trim() && secondMessage.trim()
          ? {
              kind: "split",
              // Renames move a file: both names go with it.
              first: files
                .filter((f) => first.has(f.path))
                .flatMap((f) => (f.oldPath ? [f.path, f.oldPath] : [f.path])),
              firstMessage,
              secondMessage,
            }
          : null;
  const toggle = (path: string) => {
    const next = new Set(first);
    if (!next.delete(path)) next.add(path);
    setFirst(next);
  };

  return (
    <Modal
      onClose={p.onCancel}
      className="edit-commit"
      label={t(`edit.${p.mode}`)}
      title={t(`edit.${p.mode}`)}
      onSubmit={() => {
        if (edit && !p.busy) p.onSubmit(edit);
      }}
      actions={
        <>
          <button type="button" onClick={p.onCancel}>
            {t("common.cancel")}
          </button>
          <button className="primary" type="submit" disabled={!edit || p.busy}>
            {t("edit.go")}
          </button>
        </>
      }
    >
      <p className="muted small">
        <code>{commit.id.slice(0, 7)}</code> {commit.summary}
      </p>
      {p.mode === "reword" && (
        <textarea
          className="message"
          autoFocus
          rows={5}
          aria-label={t("edit.message")}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
      )}
      {p.mode === "author" && (
        <>
          <label className="field col">
            {t("edit.name")}
            <input className="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field col">
            {t("edit.email")}
            <input className="text" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
        </>
      )}
      {p.mode === "split" && (
        <>
          <p className="small">{t("edit.split.pick")}</p>
          {!p.files && <p className="muted">{t("diff.loading")}</p>}
          {p.files && files.length < 2 && <p className="note warn">{t("edit.split.one")}</p>}
          <ul className="split-files">
            {files.map((f) => (
              <li key={f.path}>
                <label className="check">
                  <input type="checkbox" checked={first.has(f.path)} onChange={() => toggle(f.path)} />
                  <span className={`chip k-${f.status}`}>{f.status[0].toUpperCase()}</span>
                  <span className="path">{f.path}</span>
                </label>
              </li>
            ))}
          </ul>
          <label className="field col">
            {t("edit.split.first", { n: first.size })}
            <input className="text" value={firstMessage} onChange={(e) => setFirstMessage(e.target.value)} />
          </label>
          <label className="field col">
            {t("edit.split.second", { n: Math.max(files.length - first.size, 0) })}
            <input className="text" value={secondMessage} onChange={(e) => setSecondMessage(e.target.value)} />
          </label>
        </>
      )}
      <p className="muted small">{t("edit.rewrites", { n: p.rewrites })}</p>
      {p.pushed && <p className="note warn">{t("edit.pushed")}</p>}
    </Modal>
  );
}
