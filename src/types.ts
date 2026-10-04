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

/** A pull request (GitHub) or merge request (GitLab): every open one, and the latest merged or closed. */
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
  state: PrState;
  /** CI on the head commit, if any runs. */
  checks: Checks | null;
  review: Review | null;
}

export type PrState = "open" | "merged" | "closed";
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
  /** A private or self-hosted repository without Pro: no pull requests are read. */
  locked: boolean;
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

/** A line of git's `--rebase-merges` todo (mirrors `TodoItem` in git/rebase.rs). */
export type TodoItem =
  | { kind: "pick"; id: string; summary: string }
  /** Recreates a merge of `label`, the other side rebuilt just before. */
  | { kind: "merge"; id: string | null; label: string; summary: string }
  | { kind: "label"; name: string }
  /** Starts the next line of commits from `to` (a label, or `onto`: the base). */
  | { kind: "reset"; to: string };

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
  /** `name`: a local branch of another name (when the remote branch's own name is taken). */
  | { kind: "checkoutRemote"; remoteRef: string; name?: string }
  | { kind: "addRemote"; name: string; url: string; fetchOnly?: boolean }
  | { kind: "setPushable"; name: string; pushable: boolean }
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
  /** Every working tree of the repository, the main one first. */
  worktrees: WorktreeInfo[];
  submodules: SubmoduleInfo[];
}

/** One submodule (see `git/submodule.rs`). `moved`: checked out at another commit than recorded. */
export interface SubmoduleInfo {
  name: string;
  /** Relative to the working tree root. */
  path: string;
  url: string | null;
  recorded: string | null;
  checkedOut: string | null;
  state: "uninitialized" | "clean" | "moved" | "dirty";
}

export type SubmoduleOp = { kind: "update"; path: string | null } | { kind: "sync" };

/** One working tree (see `git/worktree.rs`). */
export interface WorktreeInfo {
  path: string;
  /** Checked out there; null when detached. */
  branch: string | null;
  head: string | null;
  /** The repository's original working tree (can't be removed). */
  main: boolean;
  /** The one this tab shows. */
  current: boolean;
  locked: boolean;
  /** Its folder is gone; prune forgets it. */
  missing: boolean;
}

/** Mirrors `WorktreeOp` in git/worktree.rs. */
export type WorktreeOp =
  | { kind: "add"; dir: string; branch: string | null; newBranch: string | null; at: string | null }
  | { kind: "remove"; dir: string; force: boolean }
  | { kind: "prune" };

/** `empty`: a cherry-pick / revert / rebase step stopped with nothing to do (its change is already there). */
export type OpStatus = "ok" | "failed" | "conflict" | "empty" | "diverged" | "rejected" | "auth" | "unmerged";

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
  /** False for a fetch-only remote (pushing there is disabled). */
  push: boolean;
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
  /** Subscriptions: paid through + grace; after it the app only reminds. */
  expires?: string;
  plan?: "monthly" | "yearly" | string;
}
/** What asking ddugit.com for a renewed license came to (`license::Refresh`). */
export type LicenseRefresh = "renewed" | "current" | "lapsed" | "unknown";
/** Mirrors `git/transfer.rs`. */
export interface TransferExport {
  dest: string;
  branches: string[];
  /** Everything, not just what came after the last transfer to `dest`. */
  full: boolean;
  outDir: string;
}
export interface TransferSent {
  dest: string;
  branch: string;
  tip: string;
  time: number;
}
export interface BundleCheck {
  ok: boolean;
  checksum: "match" | "mismatch" | "absent";
  heads: { name: string; id: string }[];
  missing: string[];
}
/** A stacked branch (`git/stack.rs`): built on `parent`, restacked when it moves. */
export interface StackBranch {
  name: string;
  parent: string;
  /** The parent branch is gone (merged and deleted). */
  parentMissing: boolean;
  /** The parent moved on: its tip isn't in this branch's history. */
  behind: boolean;
  /** Commits of its own, on top of the parent. */
  own: number;
}
/** Mirrors `StackOp` in git/stack.rs. */
export type StackOp =
  | { kind: "create"; name: string; parent: string }
  | { kind: "setParent"; branch: string; parent: string }
  | { kind: "remove"; branch: string }
  | { kind: "restack"; branch: string };
/** Free or Pro, and why (`pro.rs`). */
export interface ProStatus {
  pro: boolean;
  source: "license" | "site" | "trial" | "free";
  /** Days of the 14-day trial left (0 once over); null while a license covers Pro. */
  trialDaysLeft: number | null;
}
/** A newer app version than the one running (`update.rs`). */
export interface UpdateInfo {
  version: string;
  notes: string | null;
}
export interface LicenseStatus {
  license: LicenseInfo | null;
  newerThanLicense: boolean;
  checkable: boolean;
  expired: boolean;
}

/** Where one repository stands, read without its history (the galaxy dashboard, `git/glance.rs`). */
export interface RepoGlance {
  path: string;
  /** Why it couldn't be read (moved, deleted, no longer a repository). */
  error: string | null;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  /** Files with any change, untracked included. */
  changes: number;
  conflicts: number;
  state: string;
  stashes: number;
  remotes: number;
  /** URL of `origin` (else the first remote). */
  origin: string | null;
  last: { summary: string; author: string; time: number } | null;
}

/** Git LFS in one repository (see `git/lfs.rs`). */
export interface LfsStatus {
  /** `git lfs version`; null when git-lfs isn't installed. */
  version: string | null;
  /** Patterns the root `.gitattributes` sends through LFS. */
  patterns: string[];
  /** Filters configured: checkouts download the real content. */
  filters: boolean;
  /** Files still only pointers (content not downloaded). */
  missing: number;
  missingFiles: string[];
}

export type LfsOp =
  { kind: "install" } | { kind: "pull" } | { kind: "track"; pattern: string } | { kind: "untrack"; pattern: string };
