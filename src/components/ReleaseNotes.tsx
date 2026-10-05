// Release notes (Pro): the commits since the previous tag (or a picked one),
// grouped by kind as Markdown, editable before copying.

import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { copyText } from "../share";
import { forgeWeb, noteItems, releaseMarkdown } from "../notes";
import type { NoteRange } from "../types";
import { Modal } from "./Modal";

/** Section headings in the app's language. */
const LABELS = () => ({
  breaking: t("notes.kind.breaking"),
  feat: t("notes.kind.feat"),
  fix: t("notes.kind.fix"),
  perf: t("notes.kind.perf"),
  refactor: t("notes.kind.refactor"),
  docs: t("notes.kind.docs"),
  other: t("notes.kind.other"),
  empty: t("notes.kind.empty"),
});

export function ReleaseNotesDialog(p: {
  path: string;
  /** Where the notes end: a tag, a branch or HEAD. */
  to: string;
  /** The remote whose web pages the pull request numbers link to. */
  remoteUrl: string | null;
  onCopied(): void;
  onClose(): void;
}) {
  // undefined: the latest tag before `to`, picked by the backend; "": from the first commit.
  const [from, setFrom] = useState<string | undefined>(undefined);
  // What the backend answered, and for which start: while another start loads, the old notes don't show or copy.
  const [loaded, setLoaded] = useState<{ from: string | undefined; range: NoteRange | null; error: string | null }>();
  /** The tags to start from, kept from the last answer so the picker doesn't empty while loading. */
  const [knownTags, setKnownTags] = useState<string[]>([]);
  const [title, setTitle] = useState(`${p.to} (${new Date().toISOString().slice(0, 10)})`);
  const [includeOther, setIncludeOther] = useState(true);
  const [edited, setEdited] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.releaseRange(p.path, from ?? null, p.to).then(
      (r) => {
        if (!live) return;
        setLoaded({ from, range: r, error: null });
        setKnownTags(r.tags);
      },
      (e) => live && setLoaded({ from, range: null, error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, [p.path, p.to, from]);

  const current = loaded && loaded.from === from ? loaded : null;
  const range = current?.range ?? null;
  const error = current?.error ?? null;
  const items = useMemo(() => noteItems(range?.commits ?? []), [range]);
  const markdown = useMemo(
    () =>
      releaseMarkdown({
        title,
        items,
        labels: LABELS(),
        web: forgeWeb(p.remoteUrl),
        includeOther,
      }),
    [title, items, includeOther, p.remoteUrl],
  );
  const text = edited ?? markdown;
  // Options rewrite the text: what was typed by hand starts over from them.
  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      setEdited(null);
      set(v);
    };

  const start = from === undefined ? (range?.from ?? "") : from;
  const tags = knownTags.filter((tag) => tag !== p.to);

  return (
    <Modal
      onClose={p.onClose}
      className="notes"
      label={t("notes.title")}
      title={t("notes.title")}
      actions={
        <>
          <button onClick={p.onClose}>{t("common.close")}</button>
          <button className="primary" disabled={!range} onClick={() => copyText(text, p.onCopied)}>
            {t("notes.copy")}
          </button>
        </>
      }
    >
      <p className="muted small">{t("notes.hint")}</p>
      <div className="notes-range">
        <label className="field col">
          <span>{t("notes.from")}</span>
          <select value={start} onChange={(e) => reset(setFrom)(e.target.value)}>
            <option value="">{t("notes.fromStart")}</option>
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>
        <span className="notes-arrow" aria-hidden>
          →
        </span>
        <span className="mono">{p.to}</span>
      </div>
      <label className="field col">
        <span>{t("notes.heading")}</span>
        <input className="text" value={title} onChange={(e) => reset(setTitle)(e.target.value)} />
      </label>
      <label className="check">
        <input type="checkbox" checked={includeOther} onChange={(e) => reset(setIncludeOther)(e.target.checked)} />
        <span>{t("notes.other")}</span>
      </label>
      {error && <p className="note warn">{error}</p>}
      <textarea
        className="notes-md mono"
        aria-label={t("notes.title")}
        value={range ? text : ""}
        spellCheck={false}
        onChange={(e) => setEdited(e.target.value)}
      />
      <p className="muted small">
        {range && t("notes.count", { n: items.length })}
        {range?.truncated && ` · ${t("notes.truncated", { n: range.commits.length })}`}
      </p>
    </Modal>
  );
}
