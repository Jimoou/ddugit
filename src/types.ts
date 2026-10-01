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

export interface OpResult {
  ok: boolean;
  conflict: boolean;
  output: string;
}
