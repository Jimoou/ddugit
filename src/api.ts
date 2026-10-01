import { Channel, invoke } from "@tauri-apps/api/core";
import { demoControls, mock } from "./mock";
import type {
  BackportItem,
  BackportTally,
  BisectOp,
  BisectState,
  BranchReport,
  CommitEdit,
  ConflictFile,
  DiffScope,
  FileDiff,
  OpResult,
  PickOp,
  RebaseStep,
  ReflogEntry,
  ResetMode,
  Progress,
  RefOp,
  RemoteOp,
  RepoSnapshot,
  Resolution,
  StashOp,
} from "./types";
import { t } from "./i18n";

/** True inside the Tauri shell; false in a plain browser (demo mode). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const DEMO_PATH = "demo";

/** Receives streamed updates; a Tauri `Channel` in the app, a plain object in demo mode. */
export interface Sink<T> {
  onmessage: (msg: T) => void;
}

/** Tauri command name → argument object. The demo backend implements the same table. */
export interface Commands {
  initial_repo: [Record<string, never>, string | null];
  repo_root: [{ dir: string }, string | null];
  git_clone: [{ url: string; dest: string; onProgress: Sink<Progress> }, OpResult];
  git_init: [{ dir: string }, OpResult];
  repo_snapshot: [{ path: string; limit?: number }, RepoSnapshot];
  git_commit: [{ path: string; message: string; paths: string[]; amend: boolean; stagedOnly: boolean }, OpResult];
  git_stage_hunks: [
    { path: string; file: string; hunks: number[]; lines: number[] | null; unstage: boolean },
    OpResult,
  ];
  git_merge: [{ path: string; source: string; target: string | null }, OpResult];
  git_abort: [{ path: string }, OpResult];
  git_continue: [{ path: string }, OpResult];
  git_pick: [{ path: string; op: PickOp; id: string; target: string | null }, OpResult];
  git_checkout: [{ path: string; target: string }, OpResult];
  git_create_branch: [{ path: string; name: string; at: string | null; switch: boolean }, OpResult];
  git_ref: [{ path: string; op: RefOp }, OpResult];
  git_remote: [{ path: string; op: RemoteOp; onProgress: Sink<Progress> }, OpResult];
  git_reset: [{ path: string; target: string; mode: ResetMode }, OpResult];
  git_reflog: [{ path: string; limit?: number }, ReflogEntry[]];
  branch_report: [{ path: string }, BranchReport];
  git_delete_branches: [{ path: string; names: string[]; force: boolean }, OpResult];
  git_edit_commit: [{ path: string; id: string; edit: CommitEdit }, OpResult];
  git_restore_file: [{ path: string; source: string; file: string }, OpResult];
  git_bisect: [{ path: string; op: BisectOp }, OpResult];
  bisect_state: [{ path: string }, BisectState | null];
  git_discard: [{ path: string; paths: string[] }, OpResult];
  git_stash_push: [{ path: string; message: string; paths: string[] }, OpResult];
  git_stash: [{ path: string; op: StashOp; index: number }, OpResult];
  conflict_file: [{ path: string; file: string }, ConflictFile];
  git_resolve: [{ path: string; file: string; how: Resolution }, OpResult];
  commit_diff: [{ path: string; id: string }, FileDiff[]];
  worktree_diff: [{ path: string; file: string | null; scope: DiffScope }, FileDiff[]];
  set_git_path: [{ gitPath: string | null }, string];
  git_rebase: [{ path: string; base: string; steps: RebaseStep[] }, OpResult];
  backport_compare: [{ path: string; source: string; target: string }, BackportItem[]];
  backport_ignore: [{ path: string; target: string; id: string; ignore: boolean }, null];
  backport_summary: [{ path: string; source: string; targets: string[] }, BackportTally[]];
  backport_apply: [{ path: string; ids: string[]; target: string }, OpResult];
  backport_export: [{ path: string; ids: string[]; outDir: string }, OpResult];
}
export type Command = keyof Commands;
export type Args<C extends Command> = Commands[C][0];
export type Ret<C extends Command> = Commands[C][1];

function call<C extends Command>(cmd: C, args: Args<C>): Promise<Ret<C>> {
  const path = (args as { path?: string }).path;
  if (!isTauri || path === DEMO_PATH) return mock[cmd](args as never) as Promise<Ret<C>>;
  return invoke(cmd, args);
}

/** A Tauri channel for real repositories, a plain callback object for the demo. */
function progressSink(onProgress: (p: Progress) => void, path?: string): Sink<Progress> {
  if (!isTauri || path === DEMO_PATH) return { onmessage: onProgress };
  const ch = new Channel<Progress>();
  ch.onmessage = onProgress;
  return ch;
}

// Commits are immutable, so their diffs can be cached for the session.
const diffCache = new Map<string, Promise<FileDiff[]>>();

export const api = {
  initialRepo: () => (isTauri ? call("initial_repo", {}) : Promise.resolve(null)),
  /** Root of the repository `dir` (a file or folder) belongs to, or null. */
  repoRoot: (dir: string) => call("repo_root", { dir }),
  /** Clone `url` into `dest` (a new or empty folder). */
  clone(url: string, dest: string, onProgress: (p: Progress) => void = () => {}) {
    return call("git_clone", { url, dest, onProgress: progressSink(onProgress) });
  },
  /** `git init` (on `main`) in an existing folder. */
  init: (dir: string) => call("git_init", { dir }),
  snapshot: (path: string, limit?: number) => call("repo_snapshot", { path, limit }),
  commit: (path: string, message: string, paths: string[], amend = false, stagedOnly = false) =>
    call("git_commit", { path, message, paths, amend, stagedOnly }),
  stageHunks: (path: string, file: string, hunks: number[], unstage: boolean, lines?: number[]) =>
    call("git_stage_hunks", { path, file, hunks, lines: lines ?? null, unstage }),
  merge: (path: string, source: string, target: string | null) => call("git_merge", { path, source, target }),
  abort: (path: string) => call("git_abort", { path }),
  continueOp: (path: string) => call("git_continue", { path }),
  pick: (path: string, op: PickOp, id: string, target: string | null) => call("git_pick", { path, op, id, target }),
  checkout: (path: string, target: string) => call("git_checkout", { path, target }),
  createBranch: (path: string, name: string, at: string | null, switchTo: boolean) =>
    call("git_create_branch", { path, name, at, switch: switchTo }),
  ref: (path: string, op: RefOp) => call("git_ref", { path, op }),
  remote(path: string, op: RemoteOp, onProgress: (p: Progress) => void = () => {}) {
    return call("git_remote", { path, op, onProgress: progressSink(onProgress, path) });
  },
  /** Move the current branch to `target`; `mode` decides what happens to the changes passed over. */
  reset: (path: string, target: string, mode: ResetMode) => call("git_reset", { path, target, mode }),
  /** Where HEAD has been, newest first. */
  reflog: (path: string, limit?: number) => call("git_reflog", { path, limit }),
  /** Local branches with merged / gone (upstream deleted) flags, for cleaning up. */
  branchReport: (path: string) => call("branch_report", { path }),
  /** Delete many local branches; without `force` unmerged ones are refused (`unmerged`). */
  deleteBranches: (path: string, names: string[], force: boolean) =>
    call("git_delete_branches", { path, names, force }),
  /** Reword, re-author or split a past commit on the current branch (later commits are replayed). */
  editCommit: (path: string, id: string, edit: CommitEdit) => call("git_edit_commit", { path, id, edit }),
  /** Put `file` back as commit `source` had it (staged, not committed). */
  restoreFile: (path: string, source: string, file: string) => call("git_restore_file", { path, source, file }),
  /** Start a bisect between a bad and a good commit, or judge the commit checked out now. Finish with `abort`. */
  bisect: (path: string, op: BisectOp) => call("git_bisect", { path, op }),
  bisectState: (path: string) => call("bisect_state", { path }),
  discard: (path: string, paths: string[]) => call("git_discard", { path, paths }),
  stashPush: (path: string, message: string, paths: string[]) => call("git_stash_push", { path, message, paths }),
  stash: (path: string, op: StashOp, index: number) => call("git_stash", { path, op, index }),
  conflictFile: (path: string, file: string) => call("conflict_file", { path, file }),
  resolve: (path: string, file: string, how: Resolution) => call("git_resolve", { path, file, how }),
  worktreeDiff: (path: string, file: string | null = null, scope: DiffScope = "all") =>
    call("worktree_diff", { path, file, scope }),
  commitDiff(path: string, id: string): Promise<FileDiff[]> {
    const key = `${path}\n${id}`;
    let hit = diffCache.get(key);
    if (!hit) {
      hit = call("commit_diff", { path, id });
      hit.catch(() => diffCache.delete(key));
      diffCache.set(key, hit);
    }
    return hit;
  },
  /** Use this git executable (blank: PATH). Resolves to its `git --version`, rejects if it isn't git. */
  setGitPath: (gitPath: string) => call("set_git_path", { gitPath: gitPath.trim() || null }),
  /** Rewrite the commits after `base` as `steps` (oldest first) say. */
  rebase: (path: string, base: string, steps: RebaseStep[]) => call("git_rebase", { path, base, steps }),
  backportCompare: (path: string, source: string, target: string) => call("backport_compare", { path, source, target }),
  backportIgnore: (path: string, target: string, id: string, ignore: boolean) =>
    call("backport_ignore", { path, target, id, ignore }),
  backportSummary: (path: string, source: string, targets: string[]) =>
    call("backport_summary", { path, source, targets }),
  /** `ids` oldest first. */
  backportApply: (path: string, ids: string[], target: string) => call("backport_apply", { path, ids, target }),
  backportExport: (path: string, ids: string[], outDir: string) => call("backport_export", { path, ids, outDir }),
  /** Watch the repo on disk; `onChange` fires (debounced) on relevant edits. Returns an unsubscribe. */
  async watch(path: string, onChange: () => void): Promise<() => void> {
    if (!isTauri || path === DEMO_PATH) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen("repo-changed", onChange);
    await invoke("watch_repo", { path });
    return unlisten;
  },
  async pickFolder(title = t("app.open")): Promise<string | null> {
    if (!isTauri) {
      const next = demoControls.nextFolder;
      demoControls.nextFolder = null;
      return next ?? DEMO_PATH;
    }
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ directory: true, multiple: false, title });
    return typeof r === "string" ? r : null;
  },
};
