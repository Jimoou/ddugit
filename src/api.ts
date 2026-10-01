import { Channel, invoke } from "@tauri-apps/api/core";
import { mock } from "./mock";
import type {
  ConflictFile,
  DiffScope,
  FileDiff,
  OpResult,
  PickOp,
  Progress,
  RefOp,
  RemoteOp,
  RepoSnapshot,
  Resolution,
  StashOp,
} from "./types";

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
  git_discard: [{ path: string; paths: string[] }, OpResult];
  git_stash_push: [{ path: string; message: string; paths: string[] }, OpResult];
  git_stash: [{ path: string; op: StashOp; index: number }, OpResult];
  conflict_file: [{ path: string; file: string }, ConflictFile];
  git_resolve: [{ path: string; file: string; how: Resolution }, OpResult];
  commit_diff: [{ path: string; id: string }, FileDiff[]];
  worktree_diff: [{ path: string; file: string | null; scope: DiffScope }, FileDiff[]];
}
export type Command = keyof Commands;
export type Args<C extends Command> = Commands[C][0];
export type Ret<C extends Command> = Commands[C][1];

function call<C extends Command>(cmd: C, args: Args<C>): Promise<Ret<C>> {
  const path = (args as { path?: string }).path;
  if (!isTauri || path === DEMO_PATH) return mock[cmd](args as never) as Promise<Ret<C>>;
  return invoke(cmd, args);
}

// Commits are immutable, so their diffs can be cached for the session.
const diffCache = new Map<string, Promise<FileDiff[]>>();

export const api = {
  initialRepo: () => (isTauri ? call("initial_repo", {}) : Promise.resolve(null)),
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
    let sink: Sink<Progress> = { onmessage: onProgress };
    if (isTauri && path !== DEMO_PATH) {
      const ch = new Channel<Progress>();
      ch.onmessage = onProgress;
      sink = ch;
    }
    return call("git_remote", { path, op, onProgress: sink });
  },
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
  /** Watch the repo on disk; `onChange` fires (debounced) on relevant edits. Returns an unsubscribe. */
  async watch(path: string, onChange: () => void): Promise<() => void> {
    if (!isTauri || path === DEMO_PATH) return () => {};
    const { listen } = await import("@tauri-apps/api/event");
    const unlisten = await listen("repo-changed", onChange);
    await invoke("watch_repo", { path });
    return unlisten;
  },
  async pickFolder(): Promise<string | null> {
    if (!isTauri) return DEMO_PATH;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ directory: true, multiple: false, title: "Git 저장소 열기" });
    return typeof r === "string" ? r : null;
  },
};
