// The repository's own dialogs (one at a time): names, merge, reset, commit edits,
// worktrees, release notes, transfer and new pull requests.

import { api } from "../api";
import { CreatePr, prTag } from "../components/CreatePr";
import { EditCommitDialog } from "../components/EditCommit";
import { MergeDialog, squashMessage } from "../components/MergeDialog";
import { NameDialog } from "../components/NameDialog";
import { prNoun, type TokenForge } from "../components/Pulls";
import { ReleaseNotesDialog } from "../components/ReleaseNotes";
import { TransferDialog } from "../components/Transfer";
import { ResetDialog } from "../components/Undo";
import { WorktreeDialog } from "../components/Worktrees";
import { t } from "../i18n";
import { addWorktree, applyEdit, doReset } from "./actions";
import { closeDialog, type Dialog, type Repo } from "./state";

interface Props {
  repo: Repo;
  dialog: Dialog | null;
  /** Pull requests: re-read them (`retry` counts the reads), push first, connect a token. */
  pulls: {
    retry: number;
    reread(): void;
    pushTo(remote: string, branch: string): Promise<boolean>;
    connect(forge: TokenForge): void;
  };
}

export function RepoDialogs({ repo, dialog, pulls }: Props) {
  if (!dialog) return null;
  const { path, snap, busy, run, commitById } = repo;
  const close = () => closeDialog(repo, dialog.kind);

  switch (dialog.kind) {
    case "worktree":
      return (
        <WorktreeDialog
          worktrees={snap.worktrees}
          free={snap.refs
            .filter((r) => r.kind === "local" && r.name !== snap.head.branch && !repo.elsewhere[r.name])
            .map((r) => r.name)
            .sort()}
          branch={dialog.branch}
          busy={busy}
          onCancel={close}
          onAdd={(op) => void addWorktree(repo, op)}
        />
      );
    case "name":
      return <NameDialog req={dialog.req} busy={busy} onCancel={close} />;
    case "notes":
      return (
        <ReleaseNotesDialog
          path={path}
          to={dialog.to}
          remoteUrl={(snap.remotes.find((r) => r.name === "origin") ?? snap.remotes[0])?.url ?? null}
          onCopied={() => repo.toast("ok", t("notes.copied"))}
          onClose={close}
        />
      );
    case "transfer":
      return (
        <TransferDialog
          path={path}
          branches={snap.refs.filter((r) => r.kind === "local").map((r) => r.name)}
          head={snap.head.branch}
          busy={busy}
          run={run}
          onClose={close}
        />
      );
    case "edit": {
      const commit = commitById.get(dialog.id);
      if (!commit) return null;
      return (
        <EditCommitDialog
          mode={dialog.mode}
          commit={commit}
          files={dialog.files}
          rewrites={dialog.rewrites}
          pushed={dialog.pushed}
          busy={busy}
          onCancel={close}
          onSubmit={(edit) => void applyEdit(repo, dialog.id, edit)}
        />
      );
    }
    case "reset":
      return (
        <ResetDialog
          branch={snap.head.branch ?? "HEAD"}
          summary={dialog.summary}
          passed={dialog.passed}
          incoming={dialog.incoming}
          pushed={dialog.pushed}
          dirty={snap.changes.length}
          initial={dialog.initial}
          busy={busy}
          onCancel={close}
          onReset={(mode) => void doReset(repo, dialog.target, mode)}
        />
      );
    case "merge": {
      const { source, target, sourceId, targetId } = dialog;
      const label = source.length === 40 ? source.slice(0, 7) : source;
      const squash = async () => {
        // Its summary for the composer: what the source brings that the target lacks.
        const brought = snap.commits.filter((c) => repo.isAncestor(c.id, sourceId) && !repo.isAncestor(c.id, targetId));
        const message = squashMessage(label, brought);
        // Together, so the dialog hands focus back before the composer takes it. The composer
        // commits the index: exactly what the squash staged, not other work in progress.
        const compose = () => {
          close();
          repo.show({ composer: true, message, stagedOnly: true });
        };
        const r = await run(t("merge.done.squash", { source: label }), () =>
          api.merge(path, source, target, "squash", null),
        );
        // Stopped on conflicts: the message waits in the composer until they are resolved.
        if (r.status === "ok" || r.status === "conflict") compose();
        return r;
      };
      return (
        <MergeDialog
          source={label}
          target={target}
          sourceColor={repo.colorOf(sourceId)}
          targetColor={repo.colorOf(targetId)}
          switchesBranch={snap.head.branch !== target}
          canFastForward={repo.isAncestor(targetId, sourceId)}
          dirty={snap.changes.length}
          trackedDirty={snap.changes.filter((c) => c.staged || (c.unstaged && c.unstaged !== "untracked")).length}
          busy={busy}
          onCancel={close}
          onConfirm={(mode, message) => {
            if (mode === "squash") return void squash().then(close);
            void run(t("merge.done", { source, target }), () => api.merge(path, source, target, mode, message)).then(
              (r) => {
                close();
                setTimeout(() => repo.graph()?.centerOnHead(), 60);
                if (r.status !== "ok") return;
                repo.mission("merge");
                const merged = repo.latest()?.head.target;
                // A fast-forward makes no new commit: nothing to fuse.
                if (merged === sourceId) return;
                repo.playAfterDraw((at) => {
                  const p = at(merged);
                  return p && { kind: "fusion", at: p };
                });
              },
            );
          }}
        />
      );
    }
    case "pr":
      if (!repo.pulls?.forges.length) return null;
      return (
        <CreatePr
          path={path}
          snap={snap}
          forges={repo.pulls.forges}
          branch={dialog.from}
          retry={pulls.retry}
          onPush={pulls.pushTo}
          onCreated={(kind, number, url) => {
            close();
            pulls.reread();
            const label = `${prNoun(kind)} ${prTag(kind, number)}`;
            repo.toast("ok", t("pr.new.done", { label }), {
              label: t("pr.new.view"),
              onClick: () => repo.openUrl(url),
            });
          }}
          onConnect={pulls.connect}
          onOpenUrl={repo.openUrl}
          onCancel={close}
        />
      );
  }
}
