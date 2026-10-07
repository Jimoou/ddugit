// Opening the repository and its files outside the app: the file manager, the
// default app, a terminal, the editor from the settings, git's diff and merge
// tools, and a file as a commit had it. The backend checks every path and program.

import { api } from "../api";
import type { MenuItem } from "../components/ContextMenu";
import { EDITOR_CHOICES, platformOf, REVEAL } from "../external";
import { t } from "../i18n";
import type { CommitInfo, DiffTarget, OpenHow } from "../types";
import type { Repo } from "./state";

const platform = platformOf(typeof navigator === "undefined" ? "" : navigator.userAgent);

/** "Visual Studio Code" for `code`, `Zed` for `/Applications/Zed.app`. */
export function editorName(editor: string) {
  const known = EDITOR_CHOICES.find((c) => c.value === editor);
  if (known) return known.label;
  const base = editor.split(/[\\/]/).pop() || editor;
  return base.replace(/\.(app|exe|cmd|bat)$/i, "");
}

const failed = (repo: Repo, key: "open.failed" | "open.difftool.failed") => (e: unknown) =>
  repo.toast("err", t(key, { error: String(e) }));

const opener = (repo: Repo, file: string | null, how: OpenHow) => () =>
  void api.openIn(repo.path, file, how).catch(failed(repo, "open.failed"));

/** File manager, default app, editor and terminal for `file` of the work tree (null: the repository). */
export function openItems(repo: Repo, file: string | null, disabled = false): MenuItem[] {
  const { editor } = repo.external;
  return [
    { label: t(REVEAL[platform]), icon: "folder", disabled, onSelect: opener(repo, file, { kind: "reveal" }) },
    { label: t(file ? "open.default" : "open.folder"), disabled, onSelect: opener(repo, file, { kind: "default" }) },
    ...(editor
      ? [
          {
            label: t(file ? "open.editor" : "open.repoEditor", { editor: editorName(editor) }),
            disabled,
            onSelect: opener(repo, file, { kind: "editor" }),
          },
        ]
      : []),
    { label: t("open.terminal"), disabled, onSelect: opener(repo, file, { kind: "terminal" }) },
  ];
}

/** `target` in the diff tool; it stays open on its own, so nothing waits on it. */
export function difftoolItem(repo: Repo, target: DiffTarget, disabled = false): MenuItem {
  const show = async () => {
    const r = await api.difftool(repo.path, target, repo.external.diffTool || null);
    if (r.status !== "ok") failed(repo, "open.difftool.failed")(r.output);
  };
  return {
    label: t(target.file ? "open.difftool" : "open.difftool.all"),
    disabled,
    onSelect: () => void show().catch(failed(repo, "open.difftool.failed")),
  };
}

/** `file` as `commit` has it, as a read-only copy in the editor (else the default app). */
export const versionItem = (repo: Repo, commit: CommitInfo, file: string): MenuItem => ({
  label: t("open.version"),
  onSelect: () =>
    void api.openVersion(repo.path, commit.id, file, !!repo.external.editor).catch(failed(repo, "open.failed")),
});

/**
 * Resolve `file` in the merge tool. It runs until the tool's window closes, so it
 * doesn't go through `run()` (that would hold up everything else); the snapshot is
 * read again when it is done.
 */
export async function mergeInTool(repo: Repo, file: string) {
  try {
    const r = await api.mergetool(repo.path, file, repo.external.mergeTool || null);
    if (r.status === "ok") repo.toast("ok", t("open.mergetool.done", { file }));
    else repo.toast("err", t("open.mergetool.failed", { error: r.output }));
  } catch (e) {
    repo.toast("err", t("open.mergetool.failed", { error: String(e) }));
  }
  repo.refresh();
}

/** The repository's own: its folder, a terminal, the editor, and every change in the diff tool. */
export const repoOpenMenu = (repo: Repo): MenuItem[] => [
  ...openItems(repo, null),
  "separator",
  difftoolItem(repo, { kind: "worktree", staged: false, file: null }, !repo.snap.changes.length),
];
