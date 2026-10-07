import { Icon } from "./Icon";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { CommitOptions, FileChange, IdentityOp, Profile, StashOptions } from "../types";
import { IdentityLine } from "./Identity";
import { StashSaveDialog } from "./StashPanel";
import { useLoaded } from "./useLoaded";
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
  /** Message to start with (a squash merge's summary). */
  initialMessage?: string;
  /** Open in amend mode (from the HEAD node's context menu). */
  startAmend?: boolean;
  /** HEAD is already on the upstream: amending rewrites shared history. */
  headPushed: boolean;
  onCommit(
    message: string,
    paths: string[],
    newBranch: string | null,
    amend: boolean,
    stagedOnly: boolean,
    options: CommitOptions,
  ): void;
  /** Put the picked files (`[]`: everything) away in a stash, as the stash dialog says. */
  onStash(message: string, paths: string[], options: StashOptions): void;
  /** Throw the picked files' changes away (caller confirms). */
  onDiscard(paths: string[]): void;
  /** Stage (or unstage) whole files; `[]` means every change. */
  onStage(paths: string[], unstage: boolean): void;
  /** A file row's right-click menu. */
  onFileMenu(change: FileChange, x: number, y: number): void;
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
  const { changes, branch, merging, busy, onClose, onOpenFile, onCommit, onStash, onDiscard, onStage } = props;
  const { headMessage, startAmend = false, headPushed, initialMessage = "" } = props;
  const [amend, setAmend] = useState(startAmend && headMessage !== null);
  // Amend from the menu = reword: nothing picked until the user chooses files.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(amend ? [] : changes.map((c) => c.path)));
  const [message, setMessage] = useState(amend ? (headMessage ?? "").trim() : initialMessage);
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
  /*
   * Two ways to say what goes in: pick files (git adds and commits exactly those, whatever is
   * staged), or commit the index as it is ("staged only"). In the second, a file's checkbox
   * stages and unstages it. Hunk staging leaves a file both staged and unstaged, so start there then.
   */
  const [stagedOnly, setStagedOnly] = useState(() => changes.some((c) => c.staged && c.unstaged));
  // A file newly staged, whole or in part (a menu, the diff sheet, a terminal), switches to the index.
  const stagedKey = changes
    .filter((c) => c.staged)
    .map((c) => (c.unstaged ? `${c.path}\t½` : c.path))
    .join("\n");
  const [seenStaged, setSeenStaged] = useState(stagedKey);
  if (seenStaged !== stagedKey) {
    const before = new Set(seenStaged.split("\n"));
    setSeenStaged(stagedKey);
    if (stagedKey.split("\n").some((k) => k && !before.has(k))) setStagedOnly(true);
  }
  const indexMode = stagedOnly && !merging;
  const useStaged = indexMode && anyStaged;
  const fullyStaged = (c: FileChange) => !!c.staged && !c.unstaged;
  const allStaged = changes.length > 0 && changes.every(fullyStaged);

  const [noVerify, setNoVerify] = useState(false);
  const [signoff, setSignoff] = useState(false);
  const [stashing, setStashing] = useState(false);
  // `commit.template` fills an empty message; committing it untouched is refused, as git does.
  const template = useLoaded(props.path, () => api.commitTemplate(props.path)).data;
  const [seenTemplate, setSeenTemplate] = useState<string | null>(null);
  if (seenTemplate !== template) {
    setSeenTemplate(template);
    if (template && !amend && !message.trim()) setMessage(template);
  }
  const untouched = !!template && message.trim() === template.trim();
  const canCommit =
    !busy &&
    message.trim() !== "" &&
    !untouched &&
    (merging || amend || (indexMode ? anyStaged : picked.size > 0)) &&
    (amend || !useBranch || newBranch.trim() !== "");

  const submit = () => {
    if (!canCommit) return;
    const files = merging || useStaged ? [] : [...picked];
    onCommit(message.trim(), files, !amend && useBranch ? newBranch.trim() : null, amend, useStaged, {
      noVerify,
      signoff,
    });
  };

  return (
    <aside className="panel composer">
      <header>
        <div>
          <div className="eyebrow">{amend ? t("composer.amend") : t("composer.new")}</div>
          <h2>
            <Rich
              k={amend ? "composer.onAmend" : "composer.onCommit"}
              vars={{ branch: !amend && useBranch && newBranch ? newBranch : (branch ?? t("galaxy.detached")) }}
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
          {indexMode ? (
            <input
              type="checkbox"
              checked={allStaged}
              ref={(el) => {
                if (el) el.indeterminate = anyStaged && !allStaged;
              }}
              disabled={busy || changes.length === 0}
              aria-label={t(allStaged ? "composer.unstageAll" : "composer.stageAll")}
              title={t(allStaged ? "composer.unstageAll" : "composer.stageAll")}
              onChange={() => onStage([], allStaged)}
            />
          ) : (
            <input
              type="checkbox"
              checked={all}
              disabled={merging}
              onChange={() => setPicked(all ? new Set() : new Set(changes.map((c) => c.path)))}
            />
          )}
          <span>{t("composer.files", { n: changes.length })}</span>
        </label>
        <span className="muted">
          {indexMode
            ? t("composer.staged", { n: changes.filter((c) => c.staged).length })
            : t("composer.picked", { n: picked.size })}
        </span>
      </div>

      <ul className="files">
        {changes.length === 0 && <li className="empty">{t("composer.empty")}</li>}
        {changes.map((c) => {
          const k = kind(c);
          return (
            <li
              key={c.path}
              onContextMenu={(e) => {
                e.preventDefault();
                props.onFileMenu(c, e.clientX, e.clientY);
              }}
            >
              <label className="check">
                {indexMode ? (
                  <input
                    type="checkbox"
                    checked={fullyStaged(c)}
                    ref={(el) => {
                      if (el) el.indeterminate = !!c.staged && !!c.unstaged;
                    }}
                    disabled={busy || c.conflicted}
                    title={t(fullyStaged(c) ? "change.unstage" : "change.stage")}
                    onChange={() => onStage([c.path], fullyStaged(c))}
                  />
                ) : (
                  <input
                    type="checkbox"
                    disabled={merging}
                    checked={merging || picked.has(c.path)}
                    onChange={() =>
                      setPicked((s) => {
                        const n = new Set(s);
                        if (n.has(c.path)) n.delete(c.path);
                        else n.add(c.path);
                        return n;
                      })
                    }
                  />
                )}
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

      {untouched && <div className="note">{t("composer.template")}</div>}

      {!merging && changes.length > 0 && (
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

      <div className="commit-opts">
        <label className="check" title={t("composer.noVerify.title")}>
          <input type="checkbox" checked={noVerify} onChange={(e) => setNoVerify(e.target.checked)} />
          <span>{t("composer.noVerify")}</span>
        </label>
        <label className="check" title={t("composer.signoff.title")}>
          <input type="checkbox" checked={signoff} onChange={(e) => setSignoff(e.target.checked)} />
          <span>{t("composer.signoff")}</span>
        </label>
      </div>

      {stashing && (
        <StashSaveDialog
          count={all ? null : picked.size}
          message={untouched ? "" : message.trim()}
          busy={busy}
          onCancel={() => setStashing(false)}
          onSave={(msg, options) => {
            setStashing(false);
            onStash(msg, all ? [] : [...picked], options);
          }}
        />
      )}

      {!merging && (
        <div className="row side-actions">
          <button
            disabled={busy || picked.size === 0}
            title={t("composer.stash.title")}
            onClick={() => setStashing(true)}
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
