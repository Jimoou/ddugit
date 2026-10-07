// Comparing two revisions (branches or commits) in the diff sheet, and saving a file
// as a commit had it: the menu entries and what they open.

import { api } from "../api";
import type { MenuItem } from "../components/ContextMenu";
import { t } from "../i18n";
import type { CommitInfo, RefInfo } from "../types";
import type { CompareSide, Repo } from "./state";

/** Open the diff sheet on the changes from `from` to `to` (see `DiffSource` "range"). */
export const openCompare = (repo: Repo, from: CompareSide, to: CompareSide, mergeBase: boolean) =>
  repo.loadDiff({ kind: "range", from, to, mergeBase }, `${from.name} … ${to.name}`);

/** HEAD as a side: its branch's name, else `HEAD`; null before the first commit. */
export const headSide = (repo: Repo): CompareSide | null =>
  repo.snap.head.target ? { id: repo.snap.head.target, name: repo.snap.head.branch ?? "HEAD" } : null;

const commitSide = (id: string): CompareSide => ({ id, name: id.slice(0, 7) });

/**
 * A branch against the current one: what the branch adds since the two went apart
 * (`git diff HEAD...branch`), like a pull request shows it.
 */
export function compareRefItem(repo: Repo, r: RefInfo): MenuItem {
  const head = headSide(repo);
  return {
    label: t("compare.withHead", { name: head?.name ?? "HEAD" }),
    hint: t("compare.hint"),
    disabled: !head || r.target === head.id,
    onSelect: () => head && openCompare(repo, head, { id: r.target, name: r.name }, true),
  };
}

/** A commit against HEAD, or against another commit picked first ("Select for compare"). */
export function compareNodeItems(repo: Repo, id: string): MenuItem[] {
  const head = headSide(repo);
  const base = repo.compareBase;
  return [
    {
      label: t("compare.withHead", { name: "HEAD" }),
      hint: t("compare.hint"),
      disabled: !head || id === head.id,
      onSelect: () => head && openCompare(repo, commitSide(id), head, false),
    },
    base && base.id !== id
      ? {
          label: t("compare.withPicked", { sha: base.name }),
          onSelect: () => {
            repo.setCompareBase(null);
            openCompare(repo, base, commitSide(id), false);
          },
        }
      : { label: t("compare.pick"), disabled: base?.id === id, onSelect: () => repo.setCompareBase(commitSide(id)) },
  ];
}

/** "Save this version as…": `file` as `commit` has it, wherever the save dialog says. */
export function saveVersionItem(repo: Repo, commit: CommitInfo, file: string): MenuItem {
  const save = async () => {
    const dest = await api.pickSaveFile(t("file.saveAs.title"), versionName(file, commit.id));
    if (dest) await repo.run(t("file.saved", { dest }), () => api.saveFile(repo.path, commit.id, file, dest));
  };
  return { label: t("file.saveAs"), onSelect: () => void save().catch((e) => repo.toast("err", String(e))) };
}

/** `src/app.ts` at abc1234… → `app (abc1234).ts`, so the copy doesn't pass for the file itself. */
export function versionName(file: string, id: string) {
  const base = file.split("/").pop() ?? file;
  const dot = base.lastIndexOf(".");
  const [stem, ext] = dot > 0 ? [base.slice(0, dot), base.slice(dot)] : [base, ""];
  return `${stem} (${id.slice(0, 7)})${ext}`;
}
