// The repository's own dialogs (one at a time): names, merge, reset, commit edits,
// worktrees, release notes, transfer and new pull requests.

import { api } from "../api";
import { CreatePr, prTag } from "../components/CreatePr";
import { EditCommitDialog } from "../components/EditCommit";
import { MergeDialog } from "../components/MergeDialog";
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
          pushed={dialog.pushed}
          dirty={snap.changes.length}
          initial={dialog.initial}
          busy={busy}
          onCancel={close}
          onReset={(mode) => void doReset(repo, dialog.target, mode)}
        />
      );
    case "merge": {
      const { source, target } = dialog;
      return (
        <MergeDialog
          source={source.length === 40 ? source.slice(0, 7) : source}
          target={target}
          sourceColor={repo.colorOf(dialog.sourceId)}
          targetColor={repo.colorOf(dialog.targetId)}
          switchesBranch={snap.head.branch !== target}
          dirty={snap.changes.length}
          busy={busy}
          onCancel={close}
          onConfirm={() =>
            run(t("merge.done", { source, target }), () => api.merge(path, source, target)).then((r) => {
              close();
              setTimeout(() => repo.graph()?.centerOnHead(), 60);
              if (r.status !== "ok") return;
              repo.mission("merge");
              const merged = repo.latest()?.head.target;
              repo.playAfterDraw((at) => {
                const p = at(merged);
                return p && { kind: "fusion", at: p };
              });
            })
          }
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
