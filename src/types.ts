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

export interface RepoSnapshot {
  path: string;
  name: string;
  head: HeadInfo;
  commits: CommitInfo[];
  refs: RefInfo[];
  changes: FileChange[];
  state: string;
  truncated: boolean;
}

export type OpStatus = "ok" | "failed" | "conflict" | "diverged" | "rejected";

export interface OpResult {
  status: OpStatus;
  output: string;
}

export type RemoteOp = "fetch" | "pull" | "pullMerge" | "pullRebase" | "push";

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
