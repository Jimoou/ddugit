// Working-tree flows: committing, staging whole files, throwing changes away, ignoring and
// untracking files, and the stash (saving with options, popping, applying, dropping, branching).

import { api } from "../api";
import type { MenuItem } from "../components/ContextMenu";
import { stashTitle } from "../format";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import { signingHint } from "../identity";
import { ignoreChoices } from "../ignore";
import type { CommitOptions, FileChange, StashInfo, StashOptions } from "../types";
import { askName, confirmThen, richBody } from "./actions";
import type { Repo } from "./state";
import { difftoolItem, openItems } from "./outside";

/** Close the diff sheet if it shows the working tree (its files just went away). */
export const closeWorktreeDiff = (repo: Pick<Repo, "setSheet">) =>
  repo.setSheet((s) => (s?.kind === "diff" && s.source.kind === "worktree" ? null : s));

/** Commit from the composer: `paths` (or what is staged), maybe on a new branch first. */
export const commitChanges = (
  repo: Repo,
  message: string,
  paths: string[],
  newBranch: string | null,
  amend: boolean,
  stagedOnly: boolean,
  options: CommitOptions,
) =>
  repo.run(
    amend ? t("commit.amended") : t("commit.done"),
    async () => {
      if (newBranch) {
        const r = await api.createBranch(repo.path, newBranch, null, true);
        if (r.status !== "ok") return r;
      }
      const r = await api.commit(repo.path, message, paths, amend, stagedOnly, options);
      // git ran without a terminal: say what signing needs instead of git's bare error.
      const hint = r.status === "failed" ? signingHint(r.output) : null;
      return hint ? { ...r, output: `${r.output}\n${t(hint)}` } : r;
    },
    () => {
      repo.show({});
      if (!amend) repo.mission("commit");
      closeWorktreeDiff(repo);
      setTimeout(() => repo.graph()?.centerOnHead(), 60);
    },
  );

/** Stage (or unstage) whole files; `[]` means every change. */
export const stageFiles = (repo: Repo, paths: string[], unstage: boolean) =>
  repo.run(unstage ? t("stage.unstaged") : t("stage.staged"), () => api.stageFiles(repo.path, paths, unstage));

/** Throw the files' changes away, after listing them. */
export const discardFiles = (repo: Repo, paths: string[]) =>
  confirmThen(
    repo,
    {
      title: t("discard.title"),
      danger: true,
      confirmLabel: t("discard.go", { n: paths.length }),
      body: (
        <>
          <p>
            <Rich k="discard.body" /> <b>{t("discard.warn")}</b>
          </p>
          <ul>
            {paths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </>
      ),
    },
    () => void repo.run(t("discard.done"), () => api.discard(repo.path, paths)),
  );

/** Throw away an unstaged hunk of `file` (or `lines` of it) in the working tree, after asking. */
export const discardHunk = (repo: Repo, file: string, key: string, lines?: number[]) =>
  confirmThen(
    repo,
    {
      title: t("discard.title"),
      danger: true,
      confirmLabel: t("discardHunk.go"),
      body: (
        <p>
          {lines ? (
            <Rich k="discardHunk.bodyLines" vars={{ file, n: lines.length }} />
          ) : (
            <Rich k="discardHunk.body" vars={{ file }} />
          )}{" "}
          <b>{t("discard.warn")}</b>
        </p>
      ),
    },
    () => void repo.run(t("discard.done"), () => api.discardHunks(repo.path, file, [key], lines)),
  );

/** Add `pattern` to `.gitignore`; with `untrack`, also take that tracked file out of the index (after asking). */
const ignore = (repo: Repo, pattern: string | null, untrack?: string) => {
  const go = () =>
    void repo.run(untrack ? t("untrack.done", { path: untrack }) : t("ignore.done", { pattern: pattern ?? "" }), () =>
      api.ignore(repo.path, pattern ? [pattern] : [], untrack ? [untrack] : []),
    );
  if (!untrack) return go();
  confirmThen(
    repo,
    { title: t("untrack.title"), confirmLabel: t("untrack.title"), body: richBody("untrack.body", { path: untrack }) },
    go,
  );
};

/** Right-click menu of a changed file in the composer: stage it, ignore it, stop tracking it. */
export function changeMenu(repo: Repo, c: FileChange): MenuItem[] {
  const { file, ext, dir } = ignoreChoices(c.path);
  const untracked = c.unstaged === "untracked" && !c.staged;
  // Untracking only makes sense for a file the last commit has and the disk still has.
  const tracked = !untracked && c.staged !== "added" && c.unstaged !== "deleted" && c.staged !== "deleted";
  return [
    {
      label: t("change.stage"),
      icon: "plus",
      disabled: !c.unstaged || c.conflicted,
      onSelect: () => void stageFiles(repo, [c.path], false),
    },
    {
      label: t("change.unstage"),
      icon: "minus",
      disabled: !c.staged || c.conflicted,
      onSelect: () => void stageFiles(repo, [c.path], true),
    },
    "separator",
    { label: t("ignore.file"), hint: file, disabled: !untracked, onSelect: () => ignore(repo, file) },
    ...(ext
      ? [
          {
            label: t("ignore.ext", { ext: ext.ext }),
            disabled: !untracked,
            onSelect: () => ignore(repo, ext.pattern),
          },
        ]
      : []),
    ...(dir
      ? [
          {
            label: t("ignore.dir", { dir: dir.dir }),
            disabled: !untracked,
            onSelect: () => ignore(repo, dir.pattern),
          },
        ]
      : []),
    "separator",
    { label: t("untrack.keep"), disabled: !tracked, onSelect: () => ignore(repo, null, c.path) },
    { label: t("untrack.ignore"), disabled: !tracked, onSelect: () => ignore(repo, file, c.path) },
    "separator",
    // Staged only: the index against HEAD; otherwise what is still unstaged.
    difftoolItem(repo, { kind: "worktree", staged: !c.unstaged, file: c.path }, untracked || c.conflicted),
    ...openItems(repo, c.path, c.unstaged === "deleted" || (!c.unstaged && c.staged === "deleted")),
  ];
}

/** Put `paths` (all changes when empty) away in a stash. */
export const saveStash = (repo: Repo, message: string, paths: string[], options: StashOptions) =>
  repo.run(
    t("stash.saved"),
    () => api.stashPush(repo.path, message, paths, options),
    () => {
      repo.show({});
      closeWorktreeDiff(repo);
    },
  );

export const popStash = (repo: Repo, st: StashInfo) =>
  repo.run(
    t("stash.popped"),
    () => api.stash(repo.path, "pop", st.id),
    () => repo.show({}),
  );

export const applyStash = (repo: Repo, st: StashInfo) =>
  repo.run(t("stash.applied"), () => api.stash(repo.path, "apply", st.id));

export const dropStash = (repo: Repo, st: StashInfo) =>
  confirmThen(
    repo,
    {
      title: t("stash.delete.title"),
      danger: true,
      confirmLabel: t("common.delete"),
      body: <p>{t("stash.delete.body", { name: stashTitle(st.message) })}</p>,
    },
    () =>
      void repo.run(
        t("stash.deleted"),
        () => api.stash(repo.path, "drop", st.id),
        () => repo.show({}),
      ),
  );

/** `git stash branch`: a new branch where the stash was taken, with the stash popped onto it. */
export const branchFromStash = (repo: Repo, st: StashInfo) =>
  askName(
    repo,
    {
      title: t("stash.branch.title"),
      hint: t("stash.branch.hint"),
      placeholder: "stash/my-idea",
      confirmLabel: t("stash.branch.go"),
    },
    (name) =>
      void repo.run(
        t("stash.branch.done", { name }),
        () => api.stashBranch(repo.path, st.id, name),
        () => {
          repo.show({});
          setTimeout(() => repo.graph()?.centerOnHead(), 60);
        },
      ),
  );

/** Right-click menu of a stash in the sidebar. */
export const stashMenu = (repo: Repo, st: StashInfo): MenuItem[] => [
  { label: t("stashPanel.pop"), onSelect: () => void popStash(repo, st) },
  { label: t("stashPanel.apply"), onSelect: () => void applyStash(repo, st) },
  { label: t("stash.branch"), icon: "branch", onSelect: () => branchFromStash(repo, st) },
  "separator",
  { label: t("stashPanel.drop"), danger: true, onSelect: () => dropStash(repo, st) },
];
