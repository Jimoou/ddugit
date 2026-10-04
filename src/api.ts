import { Channel, invoke } from "@tauri-apps/api/core";
import { demoControls, mock } from "./mock";
import type {
  BackportItem,
  BackportTally,
  BisectOp,
  BisectState,
  Blame,
  BranchReport,
  CommitEdit,
  ConflictFile,
  DiffScope,
  FileDiff,
  FileTouch,
  HostKey,
  LfsOp,
  LfsStatus,
  LicenseRefresh,
  LicenseStatus,
  ProStatus,
  BundleCheck,
  TransferExport,
  TransferSent,
  UpdateInfo,
  OpResult,
  PickOp,
  PrReport,
  Progress,
  RebaseStep,
  RefOp,
  ReflogEntry,
  RemoteOp,
  RepoGlance,
  RepoSnapshot,
  ResetMode,
  Resolution,
  SshKey,
  SshStatus,
  SshTest,
  StashOp,
  SubmoduleOp,
  TodoItem,
  WorktreeOp,
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
  repo_glance: [{ paths: string[] }, RepoGlance[]];
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
  git_worktree: [{ path: string; op: WorktreeOp }, OpResult];
  git_submodule: [{ path: string; op: SubmoduleOp }, OpResult];
  lfs_status: [{ path: string }, LfsStatus];
  git_lfs: [{ path: string; op: LfsOp }, OpResult];
  git_remote: [{ path: string; op: RemoteOp; onProgress: Sink<Progress> }, OpResult];
  git_fetch_remote: [{ path: string; name: string; onProgress: Sink<Progress> }, OpResult];
  git_push_to: [{ path: string; remote: string; onProgress: Sink<Progress> }, OpResult];
  git_skip: [{ path: string }, OpResult];
  git_reset: [{ path: string; target: string; mode: ResetMode }, OpResult];
  git_reflog: [{ path: string; limit?: number }, ReflogEntry[]];
  branch_report: [{ path: string }, BranchReport];
  git_delete_branches: [{ path: string; names: string[]; force: boolean }, OpResult];
  git_edit_commit: [{ path: string; id: string; edit: CommitEdit }, OpResult];
  git_restore_file: [{ path: string; source: string; file: string }, OpResult];
  git_bisect: [{ path: string; op: BisectOp }, OpResult];
  bisect_state: [{ path: string }, BisectState | null];
  pull_requests: [{ path: string; trusted: string[] }, PrReport];
  ssh_status: [Record<string, never>, SshStatus];
  license_status: [Record<string, never>, LicenseStatus];
  license_install: [{ text: string }, LicenseStatus];
  license_remove: [Record<string, never>, LicenseStatus];
  license_refresh: [Record<string, never>, LicenseRefresh];
  pro_status: [Record<string, never>, ProStatus];
  transfer_export: [{ path: string; req: TransferExport }, OpResult];
  transfer_import: [{ path: string; file: string; name: string }, OpResult];
  transfer_check: [{ path: string; file: string }, BundleCheck];
  transfer_history: [{ path: string }, TransferSent[]];
  update_check: [Record<string, never>, UpdateInfo | null];
  update_install: [Record<string, never>, null];
  ssh_keygen: [{ comment: string }, SshKey];
  ssh_host_key: [{ url: string }, HostKey];
  ssh_trust_host: [{ url: string; fingerprints: string[] }, null];
  ssh_test: [{ url: string }, SshTest];
  // `path` only routes the demo; the backend keys tokens by host.
  set_forge_token: [{ path: string; host: string; token: string | null }, null];
  open_url: [{ path: string; url: string }, null];
  file_log: [{ path: string; rev: string; file: string }, FileTouch[]];
  git_blame: [{ path: string; rev: string; file: string }, Blame];
  git_discard: [{ path: string; paths: string[] }, OpResult];
  git_stash_push: [{ path: string; message: string; paths: string[] }, OpResult];
  git_stash: [{ path: string; op: StashOp; index: number }, OpResult];
  conflict_file: [{ path: string; file: string }, ConflictFile];
  git_resolve: [{ path: string; file: string; how: Resolution }, OpResult];
  commit_diff: [{ path: string; id: string }, FileDiff[]];
  worktree_diff: [{ path: string; file: string | null; scope: DiffScope }, FileDiff[]];
  set_git_path: [{ gitPath: string | null }, string];
  git_rebase: [{ path: string; base: string; steps: RebaseStep[] }, OpResult];
  git_rebase_todo: [{ path: string; base: string }, TodoItem[]];
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
  /** Where each repository stands (branch, upstream distance, changes), in `paths` order. */
  glance: (paths: string[]) => call("repo_glance", { paths }),
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
  /** Add, remove or prune worktrees; removing one with changes needs `force` (`unmerged`). */
  worktree: (path: string, op: WorktreeOp) => call("git_worktree", { path, op }),
  /** Check out submodules at their recorded commits (initializing them), or sync their URLs. */
  submodule: (path: string, op: SubmoduleOp) => call("git_submodule", { path, op }),
  /** Git LFS: installed?, tracked patterns, files left as pointers. Shells out, so not part of the snapshot. */
  lfsStatus: (path: string) => call("lfs_status", { path }),
  lfs: (path: string, op: LfsOp) => call("git_lfs", { path, op }),
  remote(path: string, op: RemoteOp, onProgress: (p: Progress) => void = () => {}) {
    return call("git_remote", { path, op, onProgress: progressSink(onProgress, path) });
  },
  /** Fetch one remote only (e.g. just added). */
  fetchRemote(path: string, name: string, onProgress: (p: Progress) => void = () => {}) {
    return call("git_fetch_remote", { path, name, onProgress: progressSink(onProgress, path) });
  },
  /** Push the current branch to `remote` and track it there from now on. */
  pushTo(path: string, remote: string, onProgress: (p: Progress) => void = () => {}) {
    return call("git_push_to", { path, remote, onProgress: progressSink(onProgress, path) });
  },
  /** Drop the cherry-pick / revert / rebase step that stopped, and go on. */
  skip: (path: string) => call("git_skip", { path }),
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
  /** Open pull / merge requests on the repository's forge remotes (GitHub, GitLab). */
  /** `trusted`: hosts besides github.com / gitlab.com whose CLI login may be used. */
  pullRequests: (path: string, trusted: string[]) => call("pull_requests", { path, trusted }),
  sshStatus: () => call("ssh_status", {}),
  licenseStatus: () => call("license_status", {}),
  licenseInstall: (text: string) => call("license_install", { text }),
  licenseRemove: () => call("license_remove", {}),
  /** Swap in a renewed subscription license from ddugit.com (the license is the only credential). */
  licenseRefresh: () => call("license_refresh", {}),
  /** Free or Pro (license, site license or the 14-day trial). */
  proStatus: () => call("pro_status", {}),
  /** Write a bundle of what `req.dest` doesn't have yet (and its .sha256); the output is its path. */
  transferExport: (path: string, req: TransferExport) => call("transfer_export", { path, req }),
  /** Fetch a bundle's branches into `refs/remotes/<name>/`. */
  transferImport: (path: string, file: string, name: string) => call("transfer_import", { path, file, name }),
  transferCheck: (path: string, file: string) => call("transfer_check", { path, file }),
  transferHistory: (path: string) => call("transfer_history", { path }),
  /** A newer version in the download storage (release builds only; otherwise `null`). */
  updateCheck: () => call("update_check", {}),
  /** Download, verify and install the newest version, then restart into it. */
  updateInstall: () => call("update_install", {}),
  sshKeygen: (comment: string) => call("ssh_keygen", { comment }),
  sshHostKey: (url: string) => call("ssh_host_key", { url }),
  /** Trust the server only if it still presents exactly `fingerprints` (what the user saw). */
  sshTrustHost: (url: string, fingerprints: string[]) => call("ssh_trust_host", { url, fingerprints }),
  sshTest: (url: string) => call("ssh_test", { url }),
  /** Keep a forge token in the keychain (`null` forgets it). */
  setForgeToken: (path: string, host: string, token: string | null) => call("set_forge_token", { path, host, token }),
  openUrl: (path: string, url: string) => call("open_url", { path, url }),
  /** Commits reachable from `rev` that changed `file` (following renames), newest first. */
  fileLog: (path: string, rev: string, file: string) => call("file_log", { path, rev, file }),
  /** Who last changed each line of `file` as of `rev`. */
  blame: (path: string, rev: string, file: string) => call("git_blame", { path, rev, file }),
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
  /** git's own plan for a range with merges (`--rebase-merges`), without starting it. */
  rebaseTodo: (path: string, base: string) => call("git_rebase_todo", { path, base }),
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
  /** A bundle file to import (the demo answers with a made-up one). */
  async pickBundle(title: string): Promise<string | null> {
    if (!isTauri) return "/demo/out/demo-acme-2026-10-04-120000.bundle";
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ multiple: false, title, filters: [{ name: "Git bundle", extensions: ["bundle"] }] });
    return typeof r === "string" ? r : null;
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
