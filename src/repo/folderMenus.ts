// Right-click menus for the repository's other folders: its worktrees and submodules.

import { api } from "../api";
import type { MenuItem } from "../components/ContextMenu";
import { t } from "../i18n";
import { joinPath } from "../recent";
import { copyText } from "../share";
import type { SubmoduleInfo, SubmoduleOp, WorktreeInfo } from "../types";
import { confirmThen, removeWorktree, richBody } from "./actions";
import type { Repo } from "./state";

export function worktreeMenu(repo: Repo, w: WorktreeInfo): MenuItem[] {
  return [
    { label: t("wt.menu.open"), disabled: w.current || w.missing, onSelect: () => repo.onOpenPath(w.path) },
    { label: t("wt.menu.copy"), onSelect: () => copyText(w.path) },
    "separator",
    ...(w.missing
      ? [
          {
            label: t("wt.menu.prune"),
            onSelect: () => void repo.run(t("wt.pruned"), () => api.worktree(repo.path, { kind: "prune" })),
          },
        ]
      : []),
    {
      label: t("wt.menu.remove"),
      danger: true,
      disabled: w.main || w.current || w.missing,
      onSelect: () =>
        confirmThen(
          repo,
          {
            title: t("wt.remove.title"),
            danger: true,
            confirmLabel: t("wt.remove.go"),
            body: richBody("wt.remove.body", { path: w.path, branch: w.branch ?? "HEAD" }),
          },
          () => removeWorktree(repo, w),
        ),
    },
  ];
}

export const submoduleRun = async (repo: Repo, label: string, op: SubmoduleOp) => {
  const r = await repo.run(label, () => api.submodule(repo.path, op));
  if (r.status === "auth") repo.toast("err", t("sub.auth"));
};

export function submoduleMenu(repo: Repo, m: SubmoduleInfo): MenuItem[] {
  return [
    {
      label: t("sub.menu.open"),
      disabled: m.state === "uninitialized",
      onSelect: () => repo.onOpenPath(joinPath(repo.snap.path, m.path)),
    },
    {
      label: t("sub.menu.update"),
      disabled: m.state === "clean",
      onSelect: () => void submoduleRun(repo, t("sub.updated"), { kind: "update", path: m.path }),
    },
    "separator",
    { label: t("sub.menu.copyUrl"), disabled: !m.url, onSelect: () => copyText(m.url ?? "") },
    { label: t("sub.menu.sync"), onSelect: () => void submoduleRun(repo, t("sub.synced"), { kind: "sync" }) },
  ];
}
