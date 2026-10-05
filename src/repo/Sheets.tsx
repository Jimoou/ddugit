// The sheet under the graph (diff, rebase plan, backport, cleanup, undo history, blame)
// and the conflict sheet over it, with what each one's buttons do.

import { useMemo } from "react";
import { api } from "../api";
import { BackportSheet } from "../components/BackportSheet";
import { CleanupSheet } from "../components/Cleanup";
import { ConflictSheet } from "../components/ConflictSheet";
import { DiffSheet } from "../components/DiffSheet";
import { BlameSheet } from "../components/History";
import { RebaseSheet } from "../components/RebaseSheet";
import { ReflogSheet } from "../components/Undo";
import { t } from "../i18n";
import { Rich } from "../i18n/Rich";
import type { CommitInfo, TodoItem } from "../types";
import { askName, askReset, confirmThen, deleteBranches, richBody, showCommit } from "./actions";
import { closeSheet, type Repo, type Sheet } from "./state";
import type { useSheet } from "./useSheet";

interface Props {
  repo: Repo;
  sheet: Sheet | null;
  conflict: { file?: string } | null;
  rebase: { commits: CommitInfo[]; todo: TodoItem[] | null } | null;
  loadDiff: ReturnType<typeof useSheet>["loadDiff"];
  askRemote(): void;
}

export function RepoSheets({ repo, sheet, conflict, rebase, loadDiff, askRemote }: Props) {
  const { path, snap, busy, run, commitById } = repo;
  const backportTargets = useMemo(() => snap.refs.filter((r) => r.kind === "local").map((r) => r.name), [snap]);
  /** Select a commit the sheet points at (when it is loaded) and fly to it. */
  const select = (id: string) => {
    if (commitById.has(id)) showCommit(repo, id);
  };

  if (conflict)
    return (
      <ConflictSheet
        path={path}
        files={snap.changes.filter((c) => c.conflicted).map((c) => c.path)}
        state={snap.state}
        initialFile={conflict.file}
        busy={busy}
        onResolve={(file, how) => void run(t("conflict.resolved", { file }), () => api.resolve(path, file, how))}
        onClose={() => repo.setConflict(null)}
      />
    );
  if (!sheet) return null;
  const close = () => closeSheet(repo, sheet.kind);

  switch (sheet.kind) {
    case "rebase": {
      if (!rebase) return null;
      const base = sheet.from;
      return (
        <RebaseSheet
          // Fresh plan whenever the history under it changes.
          key={`${base}:${snap.head.target}:${sheet.init?.map((x) => x.id).join() ?? ""}:${!!rebase.todo}`}
          branch={snap.head.branch ?? "HEAD"}
          base={commitById.get(base)!}
          commits={rebase.commits}
          todo={rebase.todo}
          initial={sheet.init}
          unpushed={snap.head.upstream ? snap.head.ahead : null}
          busy={busy}
          onApply={(steps) =>
            void run(t("rebase.done"), () => api.rebase(path, base, steps), close).then((r) => {
              if (r.status !== "ok") return;
              const replayed = replayedSince(repo, base);
              repo.playAfterDraw((at) => {
                const pts = replayed.flatMap((id) => at(id) ?? []);
                return pts.length ? { kind: "constellation", at: pts } : null;
              });
            })
          }
          onClose={close}
        />
      );
    }
    case "backport": {
      const { source, target } = sheet;
      return (
        <BackportSheet
          path={path}
          branches={snap.refs.filter((r) => r.kind !== "tag").map((r) => r.name)}
          targets={backportTargets}
          remoteCount={snap.remotes.length}
          onAddRemote={askRemote}
          source={source}
          target={target}
          version={snap}
          busy={busy}
          onPair={(source, target) => repo.setSheet({ kind: "backport", source, target })}
          onSelect={(id) => showCommit(repo, id)}
          onApply={(ids) =>
            confirmThen(
              repo,
              {
                title: t("backport.confirm.title"),
                confirmLabel: t("backport.confirm.go", { n: ids.length }),
                body: (
                  <p>
                    <Rich k="backport.confirm.body" vars={{ source, target, n: ids.length }} />
                    {snap.head.branch !== target && t("backport.confirm.switch", { target })}
                  </p>
                ),
              },
              () => void run(t("backport.done", { n: ids.length, target }), () => api.backportApply(path, ids, target)),
            )
          }
          onExport={async (ids) => {
            const dir = await api.pickFolder(t("backport.exportFolder"));
            if (dir) void run(t("backport.exported", { n: ids.length }), () => api.backportExport(path, ids, dir));
          }}
          onClose={close}
        />
      );
    }
    case "cleanup":
      return (
        <CleanupSheet
          path={path}
          version={snap}
          busy={busy}
          colorOf={repo.colorOf}
          onSelect={(id) => showCommit(repo, id)}
          onDelete={(branches, unmerged) => {
            const go = () =>
              void deleteBranches(
                repo,
                branches.map((b) => b.name),
                branches.map((b) => b.tip),
                unmerged,
              );
            if (!unmerged) return go();
            const names = branches
              .filter((b) => !b.merged)
              .map((b) => b.name)
              .join(", ");
            confirmThen(
              repo,
              {
                title: t("clean.force.title"),
                danger: true,
                confirmLabel: t("clean.force.go"),
                body: richBody("clean.force.body", { names }),
              },
              go,
            );
          }}
          onClose={close}
        />
      );
    case "reflog":
      return (
        <ReflogSheet
          path={path}
          version={snap}
          head={snap.head.target}
          busy={busy}
          onSelect={select}
          onResetTo={(e) => askReset(repo, e.id, "mixed", e.summary)}
          onRescue={(e) =>
            askName(
              repo,
              {
                title: t("undo.log.rescue.title", { sha: e.id.slice(0, 7) }),
                placeholder: `rescue/${e.id.slice(0, 7)}`,
                initial: "",
                confirmLabel: t("undo.log.rescue"),
              },
              (name) =>
                void run(
                  t("undo.log.rescued", { name }),
                  () => api.createBranch(path, name, e.id, false),
                  () => setTimeout(() => repo.graph()?.centerOn(e.id), 120),
                ),
            )
          }
          onClose={close}
        />
      );
    case "blame":
      return (
        <BlameSheet
          path={path}
          rev={sheet.rev}
          file={sheet.file}
          selected={repo.selected}
          onSelect={select}
          onClose={close}
        />
      );
    case "diff": {
      const { source } = sheet;
      const staged = source.kind === "worktree" && source.scope === "staged";
      return (
        <DiffSheet
          title={sheet.title}
          files={sheet.files}
          error={sheet.error}
          initialPath={sheet.path}
          stage={
            source.kind === "worktree"
              ? {
                  scope: source.scope,
                  busy,
                  onScope: (scope) => loadDiff({ kind: "worktree", scope }, sheet.title, sheet.path),
                  onHunk: (file, hunk, lines) =>
                    void run(staged ? t("stage.unstaged") : t("stage.staged"), () =>
                      api.stageHunks(
                        path,
                        file,
                        [sheet.files?.find((f) => f.path === file)?.hunks[hunk]?.key ?? ""],
                        staged,
                        lines,
                      ),
                    ),
                }
              : undefined
          }
          onClose={close}
        />
      );
    }
  }
}

/** After a rebase onto `base`: the commits now on HEAD above it, oldest first. */
function replayedSince(repo: Repo, base: string) {
  const latest = repo.latest();
  const byId = new Map(latest?.commits.map((c) => [c.id, c]));
  const out: string[] = [];
  for (let id = latest?.head.target; id && id !== base && out.length < 200; id = byId.get(id)?.parents[0]) out.push(id);
  return out.reverse();
}
