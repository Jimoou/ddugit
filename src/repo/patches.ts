// A commit handed on as a patch (saved to a file or copied), and a patch file applied
// to the current branch: the menu entries and their flows.

import { api } from "../api";
import type { MenuItem } from "../components/ContextMenu";
import { t } from "../i18n";
import { copyText } from "../share";
import type { CommitInfo } from "../types";
import type { Repo } from "./state";

/** `0001-fix-the-thing.patch`, the name `git format-patch` would give it. */
export function patchName(summary: string) {
  const slug = summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 52)
    .replace(/-+$/, "");
  return `0001-${slug || "patch"}.patch`;
}

/** "Save as patch…" and "Copy as patch" for commit `c` (a merge has no single patch). */
export function patchItems(repo: Repo, c: CommitInfo): MenuItem[] {
  const merge = c.parents.length > 1;
  const fail = (e: unknown) => repo.toast("err", String(e));
  const save = async () => {
    const dest = await api.pickSaveFile(t("patch.save.title"), patchName(c.summary));
    if (dest) await repo.run(t("patch.saved", { dest }), () => api.savePatch(repo.path, c.id, dest));
  };
  return [
    {
      label: t("patch.save"),
      hint: merge ? t("patch.merge") : undefined,
      disabled: merge,
      onSelect: () => void save().catch(fail),
    },
    {
      label: t("patch.copy"),
      disabled: merge,
      onSelect: () =>
        void api
          .commitPatch(repo.path, c.id)
          .then((text) => copyText(text, () => repo.toast("ok", t("patch.copied"))), fail),
    },
  ];
}

/**
 * "Apply patch…": a patch file onto the current branch. A mailed patch (format-patch) becomes
 * commits and may stop part-way on conflicts like a cherry-pick; a plain diff is left in the
 * working tree to commit.
 */
export function applyPatchItem(repo: Repo): MenuItem {
  const apply = async () => {
    const file = await api.pickPatch(t("patch.apply.title"));
    if (file) await repo.run(t("patch.applied"), () => api.applyPatch(repo.path, file));
  };
  return {
    label: t("patch.apply"),
    disabled: repo.snap.state !== "clean" || !repo.snap.head.target,
    onSelect: () => void apply().catch((e) => repo.toast("err", String(e))),
  };
}
