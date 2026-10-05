// Undoing mistakes: move the branch back to a commit (choosing what happens
// to the changes in between) and the reflog, where "lost" commits live on.

import { Icon } from "./Icon";
import { useEffect, useState } from "react";
import { api } from "../api";
import { fmtTime } from "../format";
import { type Key, t } from "../i18n";
import { Rich } from "../i18n/Rich";
import type { ReflogEntry, ResetMode } from "../types";
import { useDialog } from "./useDialog";

const MODES: { mode: ResetMode; title: Key; hint: Key }[] = [
  { mode: "soft", title: "undo.soft", hint: "undo.soft.hint" },
  { mode: "mixed", title: "undo.mixed", hint: "undo.mixed.hint" },
  { mode: "hard", title: "undo.hard", hint: "undo.hard.hint" },
];

/** "Move <branch> back to <commit>": pick soft / mixed / hard, with the consequences spelled out. */
export function ResetDialog(p: {
  branch: string;
  summary: string;
  /** Commits that leave the branch (0: it moves somewhere else, e.g. back to a lost commit). */
  passed: number;
  /** Some of them are already pushed (a force push will be needed). */
  pushed: boolean;
  /** Uncommitted changes that a hard reset throws away. */
  dirty: number;
  initial?: ResetMode;
  busy: boolean;
  onCancel(): void;
  onReset(mode: ResetMode): void;
}) {
  const [mode, setMode] = useState<ResetMode>(p.initial ?? "mixed");
  const dialog = useDialog(p.onCancel);
  return (
    <div className="scrim" onClick={p.onCancel}>
      <div className="dialog reset" aria-label={t("undo.title")} onClick={(e) => e.stopPropagation()} {...dialog}>
        <div className="eyebrow">{t("undo.title")}</div>
        <p>
          {p.passed > 0 ? (
            <Rich k="undo.body" vars={{ branch: p.branch, summary: p.summary, n: p.passed }} />
          ) : (
            <Rich k="undo.moveTo" vars={{ branch: p.branch, summary: p.summary }} />
          )}
        </p>
        <div className="choices" role="radiogroup">
          {MODES.map((m) => (
            <label
              key={m.mode}
              className={`choice ${mode === m.mode ? "on" : ""} ${m.mode === "hard" ? "danger" : ""}`}
            >
              <input type="radio" name="reset" checked={mode === m.mode} onChange={() => setMode(m.mode)} />
              <span>
                <b>{t(m.title)}</b>
                <span className="muted">{t(m.hint)}</span>
              </span>
            </label>
          ))}
        </div>
        {/* One note about what can be recovered: a hard reset over uncommitted changes can't be undone. */}
        {mode === "hard" && p.dirty > 0 ? (
          <p className="note warn">{t("undo.hard.dirty", { n: p.dirty })}</p>
        ) : (
          <p className="muted small">{t("undo.safety")}</p>
        )}
        {p.pushed && <p className="note warn">{t("undo.pushed")}</p>}
        <div className="dialog-actions">
          <button onClick={p.onCancel}>{t("common.cancel")}</button>
          <button
            className={mode === "hard" ? "primary danger" : "primary"}
            autoFocus
            disabled={p.busy}
            onClick={() => p.onReset(mode)}
          >
            {t("undo.go")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** What a reflog line says happened, in words (git's message is the fallback). */
function action(message: string): string {
  const verb = message.split(":")[0].trim().split(" ")[0];
  const key = `undo.log.${verb}` as Key;
  const known: string[] = ["commit", "reset", "checkout", "merge", "rebase", "cherry-pick", "revert", "pull"];
  return known.includes(verb) ? t(key) : message;
}

/** HEAD's history, with commits no branch reaches any more marked so they can be brought back. */
export function ReflogSheet(p: {
  path: string;
  /** Changes whenever the repository does, so the list reloads. */
  version: unknown;
  head: string | null;
  busy: boolean;
  onSelect(id: string): void;
  onResetTo(entry: ReflogEntry): void;
  onRescue(entry: ReflogEntry): void;
  onClose(): void;
}) {
  const [loaded, setLoaded] = useState<{ version: unknown; list: ReflogEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { path, version } = p;
  useEffect(() => {
    let live = true;
    api.reflog(path, 200).then(
      (list) => live && setLoaded({ version, list }),
      (e) => live && setError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [path, version]);
  const list = loaded ? loaded.list : null;

  const sheet = useDialog(p.onClose, false);
  return (
    <section className="diff-sheet reflog-sheet" style={{ height: "45vh" }} {...sheet}>
      <header>
        <div className="title">
          <span className="eyebrow">{t("undo.log.title")}</span>
          <span className="muted">{t("undo.log.hint")}</span>
        </div>
        <button className="icon" onClick={p.onClose} title={t("common.closeEsc")} aria-label={t("common.close")}>
          <Icon name="close" />
        </button>
      </header>
      {error && <p className="note warn pad">{error}</p>}
      {!list && !error && <p className="muted pad">{t("diff.loading")}</p>}
      {list?.length === 0 && <p className="muted pad">{t("undo.log.empty")}</p>}
      {list && list.length > 0 && (
        <ol className="rb-list reflog-list">
          {list.map((e, i) => (
            <li key={`${i}-${e.id}`} className={`${e.lost ? "lost" : ""} ${e.id === p.head && i === 0 ? "here" : ""}`}>
              <span className="when muted">{fmtTime(e.time, false)}</span>
              <span className="what">{action(e.message)}</span>
              <code className="link" onClick={() => p.onSelect(e.id)} title={t("bp.showInGraph")}>
                {e.id.slice(0, 7)}
              </code>
              <span className="summary" title={e.message}>
                {e.summary}
              </span>
              {e.lost && <span className="chip lost">{t("undo.log.lost")}</span>}
              {i === 0 ? (
                <span className="muted here-label">{t("undo.log.now")}</span>
              ) : (
                <span className="row">
                  {e.lost && (
                    <button disabled={p.busy} onClick={() => p.onRescue(e)}>
                      {t("undo.log.rescue")}
                    </button>
                  )}
                  <button disabled={p.busy} onClick={() => p.onResetTo(e)}>
                    {t("undo.log.back")}
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
