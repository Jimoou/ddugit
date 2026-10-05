import { Icon } from "./Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FileChange, IdentityOp, Profile } from "../types";
import { IdentityLine } from "./Identity";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";

interface Props {
  path: string;
  changes: FileChange[];
  branch: string | null;
  merging: boolean;
  busy: boolean;
  onClose(): void;
  onOpenFile(path: string): void;
  /** Full message of HEAD, prefilled when switching to amend; `null` without commits. */
  headMessage: string | null;
  /** Open in amend mode (from the HEAD node's context menu). */
  startAmend?: boolean;
  /** HEAD is already on the upstream: amending rewrites shared history. */
  headPushed: boolean;
  onCommit(message: string, paths: string[], newBranch: string | null, amend: boolean, stagedOnly: boolean): void;
  /** Put the picked files away in a stash (message may be empty). */
  onStash(message: string, paths: string[]): void;
  /** Throw the picked files' changes away (caller confirms). */
  onDiscard(paths: string[]): void;
  /** Saved identities, to switch this repository's with. */
  profiles: Profile[];
  onProfiles(next: Profile[]): void;
  onIdentity(label: string, op: IdentityOp): Promise<unknown>;
}

const LABEL: Record<string, string> = {
  added: "A",
  untracked: "U",
  modified: "M",
  deleted: "D",
  renamed: "R",
  typechange: "T",
};

function kind(c: FileChange): string {
  if (c.conflicted) return "conflict";
  return c.unstaged ?? c.staged ?? "modified";
}

/** Panel opened from the [+] node after HEAD: pick files, write a message, commit. */
export function Composer(props: Props) {
  const { changes, branch, merging, busy, onClose, onOpenFile, onCommit, onStash, onDiscard } = props;
  const { headMessage, startAmend = false, headPushed } = props;
  const [amend, setAmend] = useState(startAmend && headMessage !== null);
  // Amend from the menu = reword: nothing picked until the user chooses files.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(amend ? [] : changes.map((c) => c.path)));
  const [message, setMessage] = useState(amend ? (headMessage ?? "").trim() : "");
  const [newBranch, setNewBranch] = useState("");
  const [useBranch, setUseBranch] = useState(false);
  const msgRef = useRef<HTMLTextAreaElement>(null);

  const prevKnown = useRef(new Set(changes.map((c) => c.path)));
  // Keep selection in sync when the file list refreshes (new files default to picked).
  const paths = useMemo(() => changes.map((c) => c.path).join("\n"), [changes]);
  useEffect(() => {
    setPicked((prev) => {
      const next = new Set<string>();
      for (const c of changes) if (prev.has(c.path) || !prevKnown.current.has(c.path)) next.add(c.path);
      prevKnown.current = new Set(changes.map((c) => c.path));
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paths]);
  useEffect(() => {
    msgRef.current?.focus();
  }, []);

  const all = picked.size === changes.length && changes.length > 0;
  const anyStaged = changes.some((c) => c.staged);
  // Hunk staging leaves a file both staged and unstaged: default to committing just the staged part.
  const [stagedOnly, setStagedOnly] = useState(() => changes.some((c) => c.staged && c.unstaged));
  const partialKey = changes
    .filter((c) => c.staged && c.unstaged)
    .map((c) => c.path)
    .join("\n");
  // A newly partially-staged file (from the diff sheet) switches the mode on.
  const [seenPartial, setSeenPartial] = useState(partialKey);
  if (seenPartial !== partialKey) {
    setSeenPartial(partialKey);
    if (partialKey) setStagedOnly(true);
  }
  const useStaged = stagedOnly && anyStaged && !merging;
  const canCommit =
    !busy &&
    message.trim() !== "" &&
    (merging || amend || (useStaged ? anyStaged : picked.size > 0)) &&
    (amend || !useBranch || newBranch.trim() !== "");

  const submit = () => {
    if (!canCommit) return;
    const files = merging || useStaged ? [] : [...picked];
    onCommit(message.trim(), files, !amend && useBranch ? newBranch.trim() : null, amend, useStaged);
  };

  return (
    <aside className="panel composer">
      <header>
        <div>
          <div className="eyebrow">{amend ? t("composer.amend") : t("composer.new")}</div>
          <h2>
            <Rich
              k={amend ? "composer.onAmend" : "composer.onCommit"}
              vars={{ branch: !amend && useBranch && newBranch ? newBranch : (branch ?? "detached HEAD") }}
            />
          </h2>
        </div>
        <button className="icon" onClick={onClose} title={t("common.closeEsc")}>
          <Icon name="close" />
        </button>
      </header>

      <IdentityLine
        path={props.path}
        profiles={props.profiles}
        onProfiles={props.onProfiles}
        onChange={props.onIdentity}
      />

      {merging && <div className="note warn">{t("composer.merging")}</div>}

      <div className="files-head">
        <label className="check">
          <input
            type="checkbox"
            checked={all}
            disabled={merging}
            onChange={() => setPicked(all ? new Set() : new Set(changes.map((c) => c.path)))}
          />
          <span>{t("composer.files", { n: changes.length })}</span>
        </label>
        <span className="muted">{t("composer.picked", { n: picked.size })}</span>
      </div>

      <ul className="files">
        {changes.length === 0 && <li className="empty">{t("composer.empty")}</li>}
        {changes.map((c) => {
          const k = kind(c);
          return (
            <li key={c.path}>
              <label className="check">
                <input
                  type="checkbox"
                  disabled={merging || useStaged}
                  checked={merging || (useStaged ? !!c.staged : picked.has(c.path))}
                  onChange={() =>
                    setPicked((s) => {
                      const n = new Set(s);
                      if (n.has(c.path)) n.delete(c.path);
                      else n.add(c.path);
                      return n;
                    })
                  }
                />
                <span className={`chip k-${k}`}>{k === "conflict" ? "!" : (LABEL[k] ?? "M")}</span>
                {c.staged && c.unstaged && (
                  <span className="chip staged" title={t("composer.partial")}>
                    ½
                  </span>
                )}
                <span
                  className="path link"
                  title={t("composer.openDiff", { path: c.path })}
                  onClick={(e) => {
                    e.preventDefault(); // don't toggle the checkbox
                    onOpenFile(c.path);
                  }}
                >
                  {c.path}
                </span>
              </label>
            </li>
          );
        })}
      </ul>

      <textarea
        ref={msgRef}
        className="message"
        placeholder={t("composer.message")}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          if (e.key === "Escape") onClose();
        }}
        rows={4}
      />

      {!merging && anyStaged && (
        <label className="check" title={t("composer.stagedOnly.title")}>
          <input type="checkbox" checked={stagedOnly} onChange={(e) => setStagedOnly(e.target.checked)} />
          <span>{t("composer.stagedOnly")}</span>
        </label>
      )}

      {!merging && headMessage !== null && (
        <label className="check" title={t("composer.amendOpt.title")}>
          <input
            type="checkbox"
            checked={amend}
            onChange={(e) => {
              setAmend(e.target.checked);
              if (e.target.checked && !message.trim()) setMessage(headMessage.trim());
            }}
          />
          <span>{t("composer.amendOpt")}</span>
        </label>
      )}
      {amend && headPushed && <div className="note warn">{t("composer.pushed")}</div>}

      {!merging && !amend && (
        <div className="branch-opt">
          <label className="check">
            <input type="checkbox" checked={useBranch} onChange={(e) => setUseBranch(e.target.checked)} />
            <span>{t("composer.newBranch")}</span>
          </label>
          {useBranch && (
            <input
              className="text"
              placeholder="feature/my-idea"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value.replace(/\s+/g, "-"))}
            />
          )}
        </div>
      )}

      {!merging && (
        <div className="row side-actions">
          <button
            disabled={busy || picked.size === 0}
            title={t("composer.stash.title")}
            onClick={() => onStash(message.trim(), all ? [] : [...picked])}
          >
            {t("composer.stash")}
          </button>
          <button
            className="danger ghost"
            disabled={busy || picked.size === 0}
            title={t("composer.discard.title")}
            onClick={() => onDiscard([...picked])}
          >
            {t("composer.discard")}
          </button>
        </div>
      )}

      <button className="primary" disabled={!canCommit} onClick={submit}>
        {busy ? t("composer.committing") : amend ? t("composer.amendGo") : t("composer.commitGo")}
        <kbd>
          ⌘/Ctrl <Icon name="enter" size={11} />
        </kbd>
      </button>
    </aside>
  );
}
