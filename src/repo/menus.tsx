// Right-click menus of a repository tab: refs, commits, files, remotes, pull requests,
// worktrees and submodules. Entries that don't apply are disabled, not hidden.

import { api } from "../api";
import type { MenuItem } from "../components/ContextMenu";
import { nounOf, prOf } from "../components/Pulls";
import { t } from "../i18n";
import { offerPro } from "../pro";
import { rebaseRange } from "../rebasePlan";
import { joinPath } from "../recent";
import { copyText } from "../share";
import type { CommitInfo, PullRequest, RefInfo, SubmoduleInfo, SubmoduleOp, WorktreeInfo } from "../types";
import {
  askBranchAt,
  askLocalFor,
  askName,
  askNewBranch,
  askRebaseOnto,
  askReset,
  askTagAt,
  checkout,
  checkoutDetached,
  checkoutRef,
  confirmPick,
  confirmRevert,
  confirmThen,
  deleteBranch,
  deleteRemoteBranch,
  deleteRemoteTag,
  deleteTag,
  markBisect,
  openEdit,
  openTrail,
  pushTag,
  refRun,
  removeRemote,
  removeWorktree,
  renameBranch,
  richBody,
  showCommit,
  undoLastCommit,
} from "./actions";
import type { Repo } from "./state";
import { splitRemote } from "./useRemote";

/** Open a menu at the pointer. */
export const openMenu = (repo: Repo, x: number, y: number, title: string | undefined, items: MenuItem[]) =>
  repo.setMenu({ x, y, title, items });

const notesItem = (repo: Repo, to: string): MenuItem => ({
  label: t("menu.notes"),
  onSelect: () => (repo.pro ? repo.setDialog({ kind: "notes", to }) : offerPro("notes")),
});

/** Branch menu entries for stacks: build on this one, move it, take it out. */
function stackItems(repo: Repo, name: string): MenuItem[] {
  const stacked = repo.stacks.find((s) => s.name === name);
  const locked = (go: () => void) => () => (repo.pro ? go() : offerPro("stack"));
  const others = repo.snap.refs.filter((r) => r.kind === "local" && r.name !== name && r.name !== stacked?.parent);
  return [
    {
      label: t("menu.stackOn"),
      icon: "stack",
      onSelect: locked(() =>
        askName(
          repo,
          { title: t("stack.new.title", { parent: name }), placeholder: `${name}-2`, confirmLabel: t("stack.new.go") },
          (child) =>
            void repo.stackRun(t("stack.created", { name: child, parent: name }), {
              kind: "create",
              name: child,
              parent: name,
            }),
        ),
      ),
    },
    {
      label: t("menu.stackParent"),
      disabled: !others.length,
      onSelect: locked(() =>
        openMenu(
          repo,
          repo.menuAt().x,
          repo.menuAt().y,
          t("stack.pickParent", { name }),
          others.map((r) => ({
            label: r.name,
            icon: "branch" as const,
            onSelect: () =>
              void repo.stackRun(t("stack.parentSet", { name, parent: r.name }), {
                kind: "setParent",
                branch: name,
                parent: r.name,
              }),
          })),
        ),
      ),
    },
    ...(stacked
      ? [
          {
            label: t("menu.stackRemove"),
            onSelect: () => void repo.stackRun(t("stack.removed", { name }), { kind: "remove", branch: name }),
          },
        ]
      : []),
  ];
}

export function prMenu(repo: Repo, pr: PullRequest): MenuItem[] {
  const { snap } = repo;
  const local = snap.refs.find((x) => x.kind === "local" && x.name === pr.branch);
  const remote = snap.refs.find((x) => x.kind === "remote" && x.name === `${pr.remote}/${pr.branch}`);
  const target = local ?? remote;
  return [
    { label: t("pr.open"), onSelect: () => repo.openUrl(pr.url) },
    { label: t("pr.show"), disabled: !repo.commitById.has(pr.sha), onSelect: () => showPr(repo, pr) },
    {
      label: target ? t("pr.checkout", { branch: pr.branch }) : t("pr.checkout.missing", { branch: pr.branch }),
      disabled: !target || (local && local.name === snap.head.branch),
      onSelect: () => target && void checkoutRef(repo, target),
    },
  ];
}

/** Fly to a pull request's head commit, when it is loaded. */
export function showPr(repo: Repo, pr: PullRequest) {
  if (repo.commitById.has(pr.sha)) showCommit(repo, pr.sha);
}

/** Menu for a ref badge (graph) or a sidebar row. */
export function refMenu(repo: Repo, r: RefInfo): MenuItem[] {
  const { snap } = repo;
  if (r.kind === "pr") {
    const pr = prOf(repo.pulls, r);
    return pr ? prMenu(repo, pr) : [];
  }
  const isHead = r.kind === "local" && r.name === snap.head.branch;
  const canMerge =
    !!snap.head.branch && !isHead && r.kind !== "tag" && repo.canDropOn(snap.head.target ?? "", r.target, "merge");
  const merge: MenuItem = {
    label: snap.head.branch ? t("menu.mergeInto", { branch: snap.head.branch }) : t("menu.mergeIntoHead"),
    disabled: !canMerge,
    onSelect: () =>
      repo.setDialog({
        kind: "merge",
        sourceId: r.target,
        targetId: snap.head.target!,
        source: r.name,
        target: snap.head.branch!,
      }),
  };
  const rebaseOnto: MenuItem = {
    label: t("menu.rebaseOnto", { current: snap.head.branch ?? "HEAD", branch: r.name }),
    disabled: isHead || r.kind === "tag" || !repo.canDropOn(r.target, snap.head.target ?? "", "rebase"),
    onSelect: () => askRebaseOnto(repo, r.name, r.target),
  };
  const compare: MenuItem = {
    label: snap.head.branch ? t("menu.compare", { branch: snap.head.branch }) : t("menu.compareHead"),
    hint: t("menu.compare.hint"),
    disabled: !snap.head.branch || isHead,
    onSelect: () => repo.setSheet({ kind: "backport", source: r.name, target: snap.head.branch! }),
  };
  if (r.kind === "tag") {
    // Nothing is pushed to a fetch-only remote, deletions included.
    const remotes = snap.remotes.filter((x) => x.push).map((x) => x.name);
    return [
      { label: t("menu.tag.goto"), onSelect: () => repo.graph()?.centerOn(r.target) },
      {
        label: t("menu.checkout"),
        hint: t("menu.detached.hint"),
        disabled: !snap.head.branch && snap.head.target === r.target,
        onSelect: () => checkoutDetached(repo, `refs/tags/${r.name}`, r.name),
      },
      notesItem(repo, r.name),
      "separator",
      ...remotes.map((remote) => ({
        label: t("tag.push.menu", { remote }),
        onSelect: () => pushTag(repo, remote, r.name),
      })),
      { label: t("tag.delete.title"), danger: true, onSelect: () => deleteTag(repo, r.name) },
      ...remotes.map((remote) => ({
        label: t("menu.deleteRemoteBranch", { remote }),
        danger: true,
        onSelect: () => deleteRemoteTag(repo, remote, r.name),
      })),
    ];
  }
  if (r.kind === "remote") {
    const { remote: name, branch } = splitRemote(snap, r.name);
    return [
      {
        label: t("menu.checkoutLocal"),
        hint: t("menu.checkoutLocal.hint"),
        onSelect: () => void checkoutRef(repo, r),
      },
      {
        label: t("menu.checkoutLocalAs"),
        onSelect: () => askLocalFor(repo, r, t("branch.fromRemote", { remote: r.name }), `${name}-${branch}`),
      },
      merge,
      rebaseOnto,
      compare,
      "separator",
      { label: t("menu.branchHere"), onSelect: () => askBranchAt(repo, r.target) },
      "separator",
      {
        label: t("menu.deleteRemoteBranch", { remote: name }),
        danger: true,
        // Nothing is pushed to a fetch-only remote, deletions included; `origin/HEAD` only points at a branch.
        disabled: snap.remotes.find((x) => x.name === name)?.push === false || branch === "HEAD",
        onSelect: () => deleteRemoteBranch(repo, name, branch),
      },
      removeRemoteItem(repo, name),
    ];
  }
  return [
    { label: t("menu.checkout"), disabled: isHead, onSelect: () => void checkoutRef(repo, r) },
    {
      label: t("menu.worktree"),
      disabled: isHead || !!repo.elsewhere[r.name],
      onSelect: () => repo.setDialog({ kind: "worktree", branch: r.name }),
    },
    merge,
    rebaseOnto,
    compare,
    {
      label: t("pr.new", { noun: nounOf(repo.pulls?.forges ?? []) }),
      icon: "pull",
      disabled: !repo.pulls?.forges.length,
      onSelect: () => repo.setDialog({ kind: "pr", from: r.name }),
    },
    "separator",
    ...stackItems(repo, r.name),
    notesItem(repo, r.name),
    "separator",
    { label: t("menu.rename"), onSelect: () => renameBranch(repo, r.name) },
    { label: t("menu.tagHere"), onSelect: () => askTagAt(repo, r.target) },
    "separator",
    { label: t("menu.deleteBranch"), danger: true, disabled: isHead, onSelect: () => deleteBranch(repo, r.name) },
  ];
}

/** Menu for a commit node (also the inspector's actions). */
export function nodeMenu(repo: Repo, id: string): MenuItem[] {
  const { snap, commitById, bisect, bisectDraft } = repo;
  const head = snap.head.target;
  const isHead = id === head;
  const onHead = repo.isAncestor(id, head);
  const clean = snap.state === "clean";
  const locals = snap.refs.filter((r) => r.kind === "local" && r.target === id && r.name !== snap.head.branch);
  const range = onHead && !isHead && head ? rebaseRange(commitById, head, id) : null;
  // Past-commit edits replay everything after it: no merges on the way, not a merge itself.
  const parentOf = commitById.get(id)?.parents ?? [];
  const editable =
    clean &&
    onHead &&
    parentOf.length <= 1 &&
    (isHead || !parentOf.length || typeof rebaseRange(commitById, head!, parentOf[0]) !== "string");
  return [
    { label: t("menu.branchHere"), icon: "branch", onSelect: () => askBranchAt(repo, id) },
    { label: t("menu.tagHere"), icon: "tag", onSelect: () => askTagAt(repo, id) },
    ...locals.map((r) => ({
      label: t("menu.checkoutName", { name: r.name }),
      icon: "head" as const,
      onSelect: () => void checkout(repo, r.name),
    })),
    {
      label: t("menu.checkoutDetached"),
      disabled: isHead && !snap.head.branch,
      onSelect: () => checkoutDetached(repo, id, id.slice(0, 7)),
    },
    "separator" as const,
    {
      label: snap.head.branch ? t("menu.pickInto", { branch: snap.head.branch }) : t("menu.pickIntoHead"),
      hint: t("menu.pick.hint"),
      icon: "cherry",
      disabled: !clean || onHead || !snap.head.branch,
      onSelect: () => confirmPick(repo, id, snap.head.branch!),
    },
    {
      label: t("menu.revert"),
      icon: "undo",
      disabled: !clean || !onHead,
      onSelect: () => confirmRevert(repo, id),
    },
    {
      label: t("menu.amend"),
      icon: "edit",
      disabled: !isHead || !clean,
      onSelect: () => repo.show({ composer: true, amend: true }),
    },
    {
      label: t("undo.lastCommit"),
      disabled: !isHead || !clean || !commitById.get(id)?.parents.length,
      onSelect: () => undoLastCommit(repo, id),
    },
    {
      label: t("undo.toHere"),
      icon: "history",
      disabled: !clean || !onHead || isHead,
      onSelect: () => askReset(repo, id),
    },
    "separator" as const,
    {
      label: t("bisect.markBad"),
      hint: "bisect",
      disabled: !!bisect || !clean,
      onSelect: () => markBisect(repo, { ...bisectDraft, bad: id }),
    },
    {
      label: t("bisect.markGood"),
      hint: "bisect",
      disabled: !!bisect || !clean,
      onSelect: () => markBisect(repo, { ...bisectDraft, good: id }),
    },
    "separator" as const,
    ...(["reword", "author", "split"] as const).map((mode) => ({
      label: t(`edit.${mode}.menu`),
      disabled: !editable,
      onSelect: () => openEdit(repo, mode, id),
    })),
    {
      label: t("menu.rebase"),
      hint: typeof range === "string" ? t("menu.rebase.hasMerge") : undefined,
      disabled: !clean || !snap.head.branch || !onHead || isHead,
      onSelect: () => repo.setSheet({ kind: "rebase", from: id, init: null }),
    },
    "separator" as const,
    { label: t("menu.copySha"), hint: id.slice(0, 7), onSelect: () => copyText(id) },
  ];
}

/** A commit's changed file: put it back as this commit (or its parent) had it, or follow its history. */
export function fileMenu(repo: Repo, commit: CommitInfo, file: string): MenuItem[] {
  const restore = (rev: string) =>
    void repo.run(t("file.restored", { file }), () => api.restoreFile(repo.path, rev, file));
  return [
    { label: t("file.restore.here"), onSelect: () => restore(commit.id) },
    {
      label: t("file.restore.before"),
      disabled: !commit.parents.length,
      onSelect: () => restore(commit.parents[0]),
    },
    { label: t("history.trail"), hint: "log", onSelect: () => void openTrail(repo, commit, file) },
    {
      label: t("history.blame"),
      hint: "blame",
      onSelect: () => repo.setSheet({ kind: "blame", rev: commit.id, file }),
    },
  ];
}

const removeRemoteItem = (repo: Repo, name: string): MenuItem => ({
  label: t("remote.delete.menu", { name }),
  danger: true,
  onSelect: () => removeRemote(repo, name),
});

export function remoteMenu(repo: Repo, name: string): MenuItem[] {
  const info = repo.snap.remotes.find((x) => x.name === name);
  return [
    { label: t("remote.fetchOne", { name }), icon: "fetch", onSelect: () => void repo.fetchOne(name) },
    { label: t("remote.copyUrl"), onSelect: () => copyText(info?.url ?? "") },
    {
      label: t("remote.pushTags"),
      disabled: info?.push === false || !repo.snap.refs.some((r) => r.kind === "tag"),
      onSelect: () => void repo.remoteRef(name, { kind: "pushTags" }, t("remote.pushTags.done", { name })),
    },
    {
      label: info?.push === false ? t("remote.allowPush", { name }) : t("remote.blockPush", { name }),
      onSelect: () => {
        const push = info?.push !== false;
        void refRun(repo, t(push ? "remote.pushBlocked" : "remote.pushAllowed", { name }), {
          kind: "setPushable",
          name,
          pushable: !push,
        });
      },
    },
    "separator",
    removeRemoteItem(repo, name),
  ];
}

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

/** The top bar's branch switcher: a new branch, local branches (HEAD's first), then remote-only ones. */
export function branchesMenu(repo: Repo): MenuItem[] {
  const { snap } = repo;
  const head = snap.head.branch;
  const localNames = new Set(snap.refs.filter((r) => r.kind === "local").map((r) => r.name));
  return [
    { label: t("branch.newMenu"), icon: "plus" as const, onSelect: () => askNewBranch(repo) },
    "separator" as const,
    ...snap.refs
      .filter((r) => r.kind === "local")
      .sort((a, b) => Number(b.name === head) - Number(a.name === head) || a.name.localeCompare(b.name))
      .map((r) => ({
        label: r.name,
        hint: r.name === head ? "HEAD" : undefined,
        disabled: r.name === head,
        onSelect: () => void checkoutRef(repo, r),
      })),
    // Remote branches with no local one yet: picking one makes it local.
    ...snap.refs
      .filter((r) => r.kind === "remote" && !localNames.has(splitRemote(snap, r.name).branch))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({
        label: r.name,
        icon: "cloud" as const,
        hint: t("top.remoteOnly"),
        onSelect: () => void checkoutRef(repo, r),
      })),
  ];
}
