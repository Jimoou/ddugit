import { invoke } from "@tauri-apps/api/core";
import { mock } from "./mock";
import type { OpResult, RepoSnapshot } from "./types";

/** True inside the Tauri shell; false in a plain browser (demo mode). */
export const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const DEMO_PATH = "demo";

const demo = (path: string) => !isTauri || path === DEMO_PATH;

export const api = {
  snapshot(path: string, limit?: number): Promise<RepoSnapshot> {
    return demo(path) ? mock.snapshot() : invoke("repo_snapshot", { path, limit });
  },
  commit(path: string, message: string, paths: string[]): Promise<OpResult> {
    return demo(path) ? mock.commit(message, paths) : invoke("git_commit", { path, message, paths });
  },
  merge(path: string, source: string, target: string | null): Promise<OpResult> {
    return demo(path) ? mock.merge(source, target) : invoke("git_merge", { path, source, target });
  },
  mergeAbort(path: string): Promise<OpResult> {
    return demo(path) ? mock.mergeAbort() : invoke("git_merge_abort", { path });
  },
  checkout(path: string, target: string): Promise<OpResult> {
    return demo(path) ? mock.checkout(target) : invoke("git_checkout", { path, target });
  },
  createBranch(path: string, name: string, at: string | null, switchTo: boolean): Promise<OpResult> {
    return demo(path)
      ? mock.createBranch(name, at, switchTo)
      : invoke("git_create_branch", { path, name, at, switch: switchTo });
  },
  /** Repo given on the command line (`otgit path/to/repo`). */
  initialRepo(): Promise<string | null> {
    return isTauri ? invoke("initial_repo") : Promise.resolve(null);
  },
  async pickFolder(): Promise<string | null> {
    if (!isTauri) return DEMO_PATH;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const r = await open({ directory: true, multiple: false, title: "Git 저장소 열기" });
    return typeof r === "string" ? r : null;
  },
};
