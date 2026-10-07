// Git flows started from menus, banners, sheets and dialogs: each asks first where it
// should (a name, a confirmation), then goes through `repo.run`.

import { api } from "../api";
import type { Confirm } from "../components/ConfirmDialog";
import type { EditMode } from "../components/EditCommit";
import type { NameRequest } from "../components/NameDialog";
import { ancestors } from "../graph/layout";
import { type Key, t } from "../i18n";
import { Rich } from "../i18n/Rich";
import type { CommitEdit, CommitInfo, FileDiff, RefInfo, RefOp, ResetMode, WorktreeInfo, WorktreeOp } from "../types";
import { type BisectDraft, closeDialog, type Repo } from "./state";
import { defaultPushRemote, splitRemote } from "./useRemote";

/** A confirmation's body: one dictionary sentence with its <b>/<code> markup. */
export const richBody = (k: Key, vars?: Record<string, string | number>) => (
  <p>
    <Rich k={k} vars={vars} />
  </p>
);

/** Confirm first; the confirmation closes before `go` runs. */
export const confirmThen = (repo: Repo, c: Omit<Confirm, "onConfirm">, go: () => void) =>
  repo.setConfirm({
    ...c,
    onConfirm: () => {
      repo.setConfirm(null);
      go();
    },
  });

/** Ask for a name; the dialog closes before `then` runs. */
export const askName = (repo: Repo, req: Omit<NameRequest, "onSubmit">, then: NameRequest["onSubmit"]) =>
  repo.setDialog({
    kind: "name",
    req: {
      ...req,
      onSubmit: (name, extra, checked) => {
        closeDialog(repo, "name");
        then(name, extra, checked);
      },
    },
  });

export const refRun = (repo: Repo, label: string, op: RefOp) => repo.run(label, () => api.ref(repo.path, op));

/** Center the camera on HEAD once the new snapshot is drawn. */
const centerOnHeadSoon = (repo: Repo) => setTimeout(() => repo.graph()?.centerOnHead(), 60);

/** The remote branch a first branch starts from: a `main`/`master` (origin's first), else any. */
function remoteBase(refs: RefInfo[]): string | null {
  const remote = refs.filter((r) => r.kind === "remote" && !r.name.endsWith("/HEAD")).map((r) => r.name);
  const rank = (n: string) =>
    (n.startsWith("origin/") ? 0 : 2) + (/\/(main|master)$/.test(n) ? 0 : 4) + (n.endsWith("/master") ? 1 : 0);
  return remote.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))[0] ?? null;
}

/** A new branch where HEAD is (also the first branch of an empty repository). */
export const askNewBranch = (repo: Repo) => {
  const { head, refs } = repo.snap;
  // No commit yet (a fresh `init`, maybe with a remote fetched): a branch made here
  // would stay empty and unseen, so start from a remote branch when there is one.
  const base = head.target ? null : remoteBase(refs);
  const from = base ?? head.branch ?? head.target?.slice(0, 7);
  const first = !head.target && !base;
  askName(
    repo,
    {
      title: first ? t("branch.newFirst") : t("branch.newFromHead", { from: from ?? "" }),
      hint: first ? t("branch.newFirst.hint") : undefined,
      placeholder: "feature/my-idea",
      confirmLabel: t("branch.new.go"),
    },
    (name) => {
      const done = first ? t("branch.newFirst.done", { name }) : t("branch.new.done", { name });
      void repo.run(done, () => api.createBranch(repo.path, name, base, true));
    },
  );
};

export const askBranchAt = (repo: Repo, at: string) =>
  askName(
    repo,
    {
      title: t("branch.new.title", { sha: at.slice(0, 7) }),
      placeholder: "feature/my-idea",
      confirmLabel: t("branch.new.go"),
    },
    (name) => void repo.run(t("branch.new.done", { name }), () => api.createBranch(repo.path, name, at, true)),
  );

/** A tag at `at`, pushed to the default remote right after when the user ticks that. */
export const askTagAt = (repo: Repo, at: string) => {
  const remote = defaultPushRemote(repo.snap);
  askName(
    repo,
    {
      title: t("tag.new.title", { sha: at.slice(0, 7) }),
      placeholder: "v1.0.0",
      confirmLabel: t("tag.new.go"),
      extra: { placeholder: t("tag.new.message") },
      check: remote ? { label: t("tag.new.push", { remote }) } : undefined,
    },
    async (name, message, push) => {
      const r = await refRun(repo, t("tag.new.done", { name }), { kind: "createTag", name, at, message });
      if (push && remote && r.status === "ok") pushTag(repo, remote, name);
    },
  );
};

/** Push tag `name` to `remote`; git refuses when the tag there points elsewhere (no force from here). */
export const pushTag = (repo: Repo, remote: string, name: string) =>
  void repo.remoteRef(remote, { kind: "pushTag", name }, t("tag.push.done", { name, remote }));

/** Delete tag `name` on `remote`, after saying it goes for everyone there and the local tag stays. */
export const deleteRemoteTag = (repo: Repo, remote: string, name: string) =>
  confirmThen(
    repo,
    {
      title: t("tag.deleteRemote.title"),
      danger: true,
      confirmLabel: t("common.delete"),
      body: richBody("tag.deleteRemote.body", { remote, name }),
    },
    () => void repo.remoteRef(remote, { kind: "deleteTag", name }, t("tag.deleteRemote.done", { name, remote })),
  );

/** A local branch following remote branch `r`, under a name the user picks (`suggest` prefilled). */
export const askLocalFor = (repo: Repo, r: RefInfo, why: string, suggest: string) =>
  askName(
    repo,
    { title: why, placeholder: "feature/my-idea", confirmLabel: t("branch.fromRemote.go"), value: suggest },
    (name) =>
      void refRun(repo, t("checkout.remote.done", { name: r.name }), {
        kind: "checkoutRemote",
        remoteRef: r.name,
        name,
      }),
  );

/** Check out `target` (a branch, or a rev to detach at), called `name` in the toast. */
export const checkout = (repo: Repo, target: string, name = target) =>
  repo.run(t("checkout.done", { name }), () => api.checkout(repo.path, target));

/** Check out `rev` without a branch, after saying that commits made there belong to none. */
export const checkoutDetached = (repo: Repo, rev: string, name: string) =>
  confirmThen(
    repo,
    { title: t("detach.title"), confirmLabel: t("menu.checkout"), body: richBody("detach.body", { name }) },
    () => void checkout(repo, rev, name),
  );

export const checkoutRef = (repo: Repo, r: RefInfo) => {
  // git can't check out a branch another worktree has; open that worktree instead.
  if (r.kind === "local" && repo.elsewhere[r.name]) {
    repo.onOpenPath(repo.elsewhere[r.name]);
    repo.toast("ok", t("wt.checkedOut", { branch: r.name }));
    return;
  }
  if (r.kind !== "remote") return void checkout(repo, r.name);
  const { remote, branch } = splitRemote(repo.snap, r.name);
  const local = repo.snap.refs.find((x) => x.kind === "local" && x.name === branch);
  // The same name already holds other work (e.g. `upstream/main` next to our `main`): don't
  // silently switch to ours, follow theirs under a new name.
  if (local && local.target !== r.target)
    return askLocalFor(repo, r, t("branch.fromRemote.taken", { local: branch, remote: r.name }), `${remote}-${branch}`);
  void refRun(repo, t("checkout.remote.done", { name: r.name }), { kind: "checkoutRemote", remoteRef: r.name });
};

/** Copy commit `id` onto branch `target` (checked out first), after confirming. */
export const confirmPick = (repo: Repo, id: string, target: string) => {
  const summary = repo.commitById.get(id)?.summary ?? id.slice(0, 7);
  confirmThen(
    repo,
    {
      title: "cherry-pick",
      confirmLabel: t("pick.copy"),
      body: (
        <>
          {richBody("pick.body", { summary, target })}
          {repo.snap.head.branch !== target && <p className="note">{t("pick.switch", { target })}</p>}
        </>
      ),
    },
    () =>
      void repo
        .run(
          t("pick.done", { target }),
          () => api.pick(repo.path, "cherryPick", [id], target),
          () => centerOnHeadSoon(repo),
        )
        .then((r) => {
          if (r.status !== "ok") return;
          const copy = repo.latest()?.head.target;
          repo.playAfterDraw((at) => {
            const from = at(id),
              to = at(copy);
            return from && to ? { kind: "comet", from, to } : null;
          });
        }),
  );
};

export const confirmRevert = (repo: Repo, id: string) =>
  confirmThen(
    repo,
    {
      title: "revert",
      confirmLabel: t("revert.go"),
      body: richBody("revert.body", {
        summary: repo.commitById.get(id)?.summary ?? id.slice(0, 7),
        branch: repo.snap.head.branch ?? "HEAD",
      }),
    },
    () => void repo.run(t("revert.done"), () => api.pick(repo.path, "revert", [id], null)),
  );

/** Delete a local branch; if git says it's unmerged, ask again before forcing. */
export const deleteBranch = (repo: Repo, name: string) =>
  confirmThen(
    repo,
    {
      title: t("branch.delete.title"),
      danger: true,
      confirmLabel: t("common.delete"),
      body: richBody("branch.delete.body", { name }),
    },
    async () => {
      const r = await refRun(repo, t("branch.delete.done", { name }), { kind: "deleteBranch", name, force: false });
      if (r.status !== "unmerged") return;
      confirmThen(
        repo,
        {
          title: t("branch.unmerged.title"),
          danger: true,
          confirmLabel: t("branch.unmerged.go"),
          body: richBody("branch.unmerged.body", { name }),
        },
        () => void refRun(repo, t("branch.delete.done", { name }), { kind: "deleteBranch", name, force: true }),
      );
    },
  );

export const renameBranch = (repo: Repo, from: string) =>
  askName(
    repo,
    {
      title: t("branch.rename.title"),
      placeholder: t("branch.rename.placeholder"),
      confirmLabel: t("branch.rename.go"),
      initial: from,
    },
    (to) => void refRun(repo, t("branch.rename.done", { name: to }), { kind: "renameBranch", from, to }),
  );

export const deleteTag = (repo: Repo, name: string) =>
  confirmThen(
    repo,
    {
      title: t("tag.delete.title"),
      danger: true,
      confirmLabel: t("common.delete"),
      body: richBody("tag.delete.body", { name }),
    },
    () => void refRun(repo, t("tag.delete.done", { name }), { kind: "deleteTag", name }),
  );

/** Delete `branch` on `remote`, after saying it goes for everyone who uses that remote. */
export const deleteRemoteBranch = (repo: Repo, remote: string, branch: string) =>
  confirmThen(
    repo,
    {
      title: t("remoteBranch.delete.title"),
      danger: true,
      confirmLabel: t("common.delete"),
      body: richBody("remoteBranch.delete.body", { remote, branch }),
    },
    () =>
      void repo.remoteRef(
        remote,
        { kind: "deleteBranch", name: branch },
        t("remoteBranch.delete.done", { name: `${remote}/${branch}` }),
      ),
  );

export const removeRemote = (repo: Repo, name: string) =>
  confirmThen(
    repo,
    {
      title: t("remote.delete.title"),
      danger: true,
      confirmLabel: t("common.delete"),
      body: richBody("remote.delete.body", { name }),
    },
    () => void refRun(repo, t("remote.delete.done", { name }), { kind: "removeRemote", name }),
  );

export const addWorktree = async (repo: Repo, op: Extract<WorktreeOp, { kind: "add" }>) => {
  const branch = op.newBranch ?? op.branch ?? "";
  const r = await repo.run(t("wt.added", { branch }), () => api.worktree(repo.path, op));
  if (r.status === "ok") {
    closeDialog(repo, "worktree");
    repo.onOpenPath(op.dir);
  }
};

/** Remove a worktree; if it has changes, ask again before forcing. */
export const removeWorktree = (repo: Repo, w: WorktreeInfo, force = false) => {
  repo.setConfirm(null);
  void repo
    .run(t("wt.remove.done"), () => api.worktree(repo.path, { kind: "remove", dir: w.path, force }))
    .then((r) => {
      if (r.status !== "unmerged") return;
      repo.setConfirm({
        title: t("wt.dirty.title"),
        danger: true,
        confirmLabel: t("wt.dirty.go"),
        body: richBody("wt.dirty.body", { path: w.path }),
        onConfirm: () => removeWorktree(repo, w, true),
      });
    });
};

/** Is `id` already on the upstream branch (so rewriting it needs a force push)? */
const pushedCommit = (repo: Repo, id: string) => {
  const up = repo.snap.refs.find((r) => r.kind === "remote" && r.name === repo.snap.head.upstream);
  return !!up && repo.isAncestor(id, up.target);
};

/** Replay the current branch's own commits on top of branch `onto` (its tip `ontoId`), after saying what changes. */
export const askRebaseOnto = (repo: Repo, onto: string, ontoId: string) => {
  const { snap, commitById } = repo;
  const current = snap.head.branch;
  if (!current || !snap.head.target) return;
  const mine = [...ancestors(snap.commits, snap.head.target)].filter((c) => !repo.isAncestor(c, ontoId));
  const merges = mine.filter((c) => (commitById.get(c)?.parents.length ?? 0) > 1).length;
  // More commits are rewritten than are unpushed: some were pushed (as in the rebase sheet).
  const pushed = !!snap.head.upstream && mine.length > snap.head.ahead;
  confirmThen(
    repo,
    {
      title: t("rebaseOnto.title"),
      confirmLabel: t("rebaseOnto.go"),
      body: (
        <>
          {richBody("rebaseOnto.body", { current, onto, n: mine.length - merges })}
          {merges > 0 && <p className="note warn">{t("rebaseOnto.merges", { n: merges })}</p>}
          {pushed && <p className="note warn">{t("rb.pushed")}</p>}
          {snap.changes.length > 0 && <p className="note">{t("rebaseOnto.dirty")}</p>}
        </>
      ),
    },
    () =>
      void repo.run(
        t("rebaseOnto.done", { current, onto }),
        () => api.rebaseOnto(repo.path, onto),
        () => centerOnHeadSoon(repo),
      ),
  );
};

/** Open the edit dialog for `id`; splitting needs its files. */
export const openEdit = (repo: Repo, mode: EditMode, id: string) => {
  const { snap } = repo;
  const parent = repo.commitById.get(id)?.parents[0];
  const rewrites = snap.head.target
    ? [...ancestors(snap.commits, snap.head.target)].filter((c) => !parent || !repo.isAncestor(c, parent)).length
    : 1;
  repo.setDialog({ kind: "edit", mode, id, files: null, rewrites, pushed: pushedCommit(repo, id) });
  if (mode === "split")
    void api.commitDiff(repo.path, id).then(
      (files) => setEditFiles(repo, id, files),
      () => setEditFiles(repo, id, []),
    );
};

const setEditFiles = (repo: Repo, id: string, files: FileDiff[]) =>
  repo.setDialog((d) => (d?.kind === "edit" && d.id === id ? { ...d, files } : d));

export const applyEdit = (repo: Repo, id: string, edit: CommitEdit) => {
  const at = repo.graph()?.screenOf(id) ?? null;
  return repo.run(
    t(`edit.done.${edit.kind}`),
    () => api.editCommit(repo.path, id, edit),
    () => {
      closeDialog(repo, "edit");
      if (at) repo.play({ kind: "nova", at });
    },
  );
};

/** Move the branch to `target` with `mode`, then play the rewind. */
export const doReset = (
  repo: Repo,
  target: string,
  mode: ResetMode,
  label = t("undo.done", { branch: repo.snap.head.branch ?? "HEAD" }),
) =>
  repo.run(
    label,
    () => api.reset(repo.path, target, mode),
    () => {
      closeDialog(repo, "reset");
      repo.play({ kind: "rewind" });
      repo.mission("undo");
      centerOnHeadSoon(repo);
    },
  );

/** Ask how to go back to `target` (a commit, maybe one only the reflog knows). */
export const askReset = (repo: Repo, target: string, initial?: ResetMode, summary?: string) => {
  const { snap, commitById } = repo;
  if (!snap.head.target) return;
  // Commits leaving the branch; unknown for a commit only the reflog has (it isn't loaded).
  const passed = commitById.has(target)
    ? [...ancestors(snap.commits, snap.head.target)].filter((c) => !repo.isAncestor(c, target)).length
    : 0;
  repo.setDialog({
    kind: "reset",
    target,
    summary: summary ?? commitById.get(target)?.summary ?? target.slice(0, 7),
    passed,
    // More commits leave the branch than are unpushed: some were pushed.
    pushed: !!snap.head.upstream && passed > snap.head.ahead,
    initial,
  });
};

/** Undo the last commit, keeping its changes; explain the force push first when it was pushed. */
export const undoLastCommit = (repo: Repo, id: string) => {
  const parent = repo.commitById.get(id)!.parents[0];
  const { head } = repo.snap;
  if (head.upstream && head.ahead === 0) askReset(repo, parent, "soft");
  else void doReset(repo, parent, "soft", t("undo.lastCommit.done"));
};

/** Draw the file's path through history; from HEAD when it reaches this commit, so newer changes show too. */
export const openTrail = async (repo: Repo, commit: CommitInfo, file: string) => {
  const rev = repo.isAncestor(commit.id, repo.snap.head.target) ? "HEAD" : commit.id;
  try {
    const touches = await api.fileLog(repo.path, rev, file);
    repo.setTrail({ file, touches });
    repo.setBisectDraft(null);
  } catch (e) {
    repo.toast("err", String(e));
  }
};

/** Pick a bisect end; with both picked, start (the bad one must come after the good one). */
export const markBisect = (repo: Repo, draft: BisectDraft) => {
  if (!draft.bad || !draft.good) return repo.setBisectDraft(draft);
  if (!repo.isAncestor(draft.good, draft.bad)) {
    repo.toast("err", t("bisect.order"));
    return repo.setBisectDraft({ bad: draft.bad });
  }
  repo.setBisectDraft(null);
  const { bad, good } = draft;
  void repo.run(t("bisect.started"), () => api.bisect(repo.path, { kind: "start", bad, good }));
};

/** Delete branches together; their tips scatter as stardust where they were drawn. */
export const deleteBranches = (repo: Repo, names: string[], tips: string[], force: boolean) => {
  const at = tips.flatMap((id) => repo.graph()?.screenOf(id) ?? []);
  return repo.run(
    t("clean.done", { n: names.length }),
    () => api.deleteBranches(repo.path, names, force),
    () => repo.play({ kind: "dust", at }),
  );
};

/** Show commit `id` in the panel and fly the camera to it. */
export const showCommit = (repo: Repo, id: string) => {
  repo.show({ commit: id });
  repo.graph()?.centerOn(id);
};
