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

/** `pr` refs exist only on the frontend: open pull requests drawn like labels (see `components/Pulls.tsx`). */
export type RefKind = "local" | "remote" | "tag" | "pr";

export interface RefInfo {
  name: string;
  kind: RefKind;
  target: string;
  /** `pr` refs only: CI on the pull request's head, which colors its label. */
  checks?: Checks | null;
  /** `pr` refs only: drawn as a mark after the name (approved / changes requested). */
  review?: Review | null;
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

/** Mirrors `RebaseAction` / `RebaseStep` in git/rebase.rs. */
/** Driving `git bisect`: mark the ends, then judge the commit checked out now. */
export type BisectOp =
  { kind: "start"; bad: string; good: string } | { kind: "good" } | { kind: "bad" } | { kind: "skip" };

/** The bisect in progress (see `git/bisect.rs`). */
export interface BisectState {
  bad: string | null;
  good: string[];
  skipped: string[];
  /** The commit to test now, unless the culprit is found. */
  current: string | null;
  culprit: string | null;
  /** Commits that may still be the first bad one, newest first. */
  candidates: string[];
}

export type ForgeKind = "github" | "gitlab";

/** An open pull request (GitHub) or merge request (GitLab). */
export interface PullRequest {
  remote: string;
  number: number;
  title: string;
  url: string;
  draft: boolean;
  /** Source branch on the forge. */
  branch: string;
  /** Head commit. */
  sha: string;
  author: string;
  /** CI on the head commit, if any runs. */
  checks: Checks | null;
  review: Review | null;
}

export type Checks = "success" | "failure" | "pending";
/** `changes`: changes requested; `required`: waiting for a required review. */
export type Review = "approved" | "changes" | "required";

export interface ForgeStatus {
  remote: string;
  kind: ForgeKind;
  host: string;
  slug: string;
  /** Where the token came from: the forge CLI (`gh` / `glab`), the keychain, or nowhere yet. */
  token: "cli" | "keychain" | "none";
  /** github.com / gitlab.com themselves (anything else is only named like one). */
  public: boolean;
  /** The token was refused. */
  unauthorized: boolean;
  error: string | null;
}

export interface PrReport {
  forges: ForgeStatus[];
  prs: PullRequest[];
}

/** A commit that changed a file, and the file's path in it (renames are followed). */
export interface FileTouch {
  id: string;
  path: string;
}

/** Consecutive lines last changed by the same commit. */
export interface BlameHunk {
  commit: string;
  /** Index of the first line in `Blame.lines`. */
  start: number;
  len: number;
  author: string;
  /** Seconds since the Unix epoch. */
  time: number;
  summary: string;
}

export interface Blame {
  lines: string[];
  hunks: BlameHunk[];
}

/** A touch-up to one past commit on the current branch (see `git/edit.rs`). */
export type CommitEdit =
  | { kind: "reword"; message: string }
  | { kind: "author"; name: string; email: string }
  /** `first`: paths (old names of renames too) for a first commit; the rest stay in a second. */
  | { kind: "split"; first: string[]; firstMessage: string; secondMessage: string };

/** One local branch for housekeeping (see `git/cleanup.rs`). */
export interface BranchHealth {
  name: string;
  tip: string;
  time: number;
  merged: boolean;
  gone: boolean;
  upstream: string | null;
}
export interface BranchReport {
  base: string | null;
  branches: BranchHealth[];
}

/** What a reset does with the changes of the commits it moves past. */
export type ResetMode = "soft" | "mixed" | "hard";

/** One move of HEAD (newest first). `lost`: only the reflog still reaches it. */
export interface ReflogEntry {
  id: string;
  prev: string;
  message: string;
  summary: string;
  time: number;
  lost: boolean;
}

export type RebaseAction = "pick" | "squash" | "fixup" | "drop";
export interface RebaseStep {
  id: string;
  action: RebaseAction;
}

/** Mirrors `BackportState` in git/backport.rs (`kind` tag). */
export type BackportState =
  { kind: "missing" } | { kind: "applied" } | { kind: "picked"; by: string } | { kind: "ignored" };

export interface BackportTally {
  target: string;
  missing: number;
  applied: number;
  ignored: number;
}

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
  | { kind: "checkoutRemote"; remoteRef: string }
  | { kind: "addRemote"; name: string; url: string }
  | { kind: "removeRemote"; name: string };

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

export type RemoteOp = "fetch" | "pull" | "pullMerge" | "pullRebase" | "push" | "forcePush";

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

/** Mirrors `ssh.rs`: the user's SSH keys, a server's host key, a connection test. */
export interface SshKey {
  name: string;
  /** The `.pub` line to add to the forge. */
  public: string;
}
export interface SshStatus {
  available: boolean;
  keys: SshKey[];
}
export interface HostKey {
  host: string;
  port: number | null;
  known: boolean;
  fingerprints: string[];
  /** Matches what the forge publishes (null: it publishes none we know). */
  verified: boolean | null;
}
export interface SshTest {
  ok: boolean;
  user: string | null;
  output: string;
}

/** Mirrors `license.rs`. */
export interface LicenseInfo {
  id: string;
  name: string;
  email: string;
  kind: "commercial" | "site" | string;
  seats: number;
  issued: string;
  updatesUntil: string;
}
export interface LicenseStatus {
  license: LicenseInfo | null;
  newerThanLicense: boolean;
  checkable: boolean;
}
