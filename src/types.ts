// Mirrors the serde structs in src-tauri/src/git.rs.

export interface CommitInfo {
  id: string;
  parents: string[];
  summary: string;
  message: string;
  author: string;
  email: string;
  /** Seconds since the Unix epoch. */
  time: number;
}

export type RefKind = "local" | "remote" | "tag";

export interface RefInfo {
  name: string;
  kind: RefKind;
  target: string;
}

export interface HeadInfo {
  branch: string | null;
  target: string | null;
  /** Tracking branch, e.g. `origin/main`. */
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface FileChange {
  path: string;
  staged: string | null;
  unstaged: string | null;
  conflicted: boolean;
}

export interface StashInfo {
  /** Position in the stash list: `stash@{index}`. */
  index: number;
  message: string;
  id: string;
  /** Commit the stash was taken on. */
  base: string;
  time: number;
}

export type StashOp = "apply" | "pop" | "drop";

export type PickOp = "cherryPick" | "revert";

/** Mirrors `BackportState` in git/backport.rs (`kind` tag). */
export type BackportState =
  { kind: "missing" } | { kind: "applied" } | { kind: "picked"; by: string } | { kind: "ignored" };

export interface BackportItem {
  id: string;
  summary: string;
  author: string;
  time: number;
  state: BackportState;
}

/** Which local changes a working-tree diff shows (mirrors `DiffScope`). */
export type DiffScope = "all" | "unstaged" | "staged";

/** Mirrors `RefOp` in git/refs.rs (`kind` tag, camelCase fields). */
export type RefOp =
  | { kind: "renameBranch"; from: string; to: string }
  | { kind: "deleteBranch"; name: string; force: boolean }
  | { kind: "createTag"; name: string; at: string; message: string }
  | { kind: "deleteTag"; name: string }
  | { kind: "checkoutRemote"; remoteRef: string };

export interface RepoSnapshot {
  path: string;
  name: string;
  head: HeadInfo;
  commits: CommitInfo[];
  refs: RefInfo[];
  remotes: RemoteInfo[];
  changes: FileChange[];
  stashes: StashInfo[];
  state: string;
  /** Commit a stopped merge / cherry-pick / revert is bringing in. */
  incoming: string | null;
  truncated: boolean;
}

export type OpStatus = "ok" | "failed" | "conflict" | "diverged" | "rejected" | "auth" | "unmerged";

export interface OpResult {
  status: OpStatus;
  output: string;
}

export type RemoteOp = "fetch" | "pull" | "pullMerge" | "pullRebase" | "push";

/** Parsed from git's `--progress` output. */
export interface Progress {
  phase: string;
  percent: number;
}

export interface RemoteInfo {
  name: string;
  url: string;
}

export interface DiffLine {
  kind: "+" | "-" | " ";
  old: number | null;
  new: number | null;
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface FileDiff {
  path: string;
  oldPath: string | null;
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
  truncated: boolean;
  hunks: DiffHunk[];
}

export interface ConflictFile {
  path: string;
  base: string | null;
  /** HEAD's side (during a rebase: the branch being rebased onto). */
  ours: string | null;
  /** The incoming side. */
  theirs: string | null;
  /** Working-tree file with conflict markers. */
  merged: string;
  binary: boolean;
}

/** Mirrors `Resolution` in git/conflict.rs. */
export type Resolution = { kind: "ours" } | { kind: "theirs" } | { kind: "content"; text: string };
