import { Channel, invoke } from "@tauri-apps/api/core";
import { mock } from "./mock";
import type { FileDiff, OpResult, Progress, RemoteOp, RepoSnapshot, StashOp } from "./types";

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
  git_commit: [{ path: string; message: string; paths: string[] }, OpResult];
  git_merge: [{ path: string; source: string; target: string | null }, OpResult];
  git_abort: [{ path: string }, OpResult];
  git_continue_rebase: [{ path: string }, OpResult];
  git_checkout: [{ path: string; target: string }, OpResult];
  git_create_branch: [{ path: string; name: string; at: string | null; switch: boolean }, OpResult];
  git_remote: [{ path: string; op: RemoteOp; onProgress: Sink<Progress> }, OpResult];
  git_discard: [{ path: string; paths: string[] }, OpResult];
  git_stash_push: [{ path: string; message: string; paths: string[] }, OpResult];
  git_stash: [{ path: string; op: StashOp; index: number }, OpResult];
  commit_diff: [{ path: string; id: string }, FileDiff[]];
  worktree_diff: [{ path: string; file: string | null }, FileDiff[]];
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
  commit: (path: string, message: string, paths: string[]) => call("git_commit", { path, message, paths }),
  merge: (path: string, source: string, target: string | null) => call("git_merge", { path, source, target }),
  abort: (path: string) => call("git_abort", { path }),
  continueRebase: (path: string) => call("git_continue_rebase", { path }),
  checkout: (path: string, target: string) => call("git_checkout", { path, target }),
  createBranch: (path: string, name: string, at: string | null, switchTo: boolean) =>
    call("git_create_branch", { path, name, at, switch: switchTo }),
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
  worktreeDiff: (path: string, file: string | null = null) => call("worktree_diff", { path, file }),
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
  async pickFolder(): Promise<string | null> {
    if (!isTauri) return DEMO_PATH;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ directory: true, multiple: false, title: "Git 저장소 열기" });
    return typeof r === "string" ? r : null;
  },
};
