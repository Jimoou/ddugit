// What a repository tab's pieces (menus, banners, sheets, dialogs, remote flows)
// share: which sheet and which dialog are open, and the `Repo` they act through.

import type { Dispatch, SetStateAction } from "react";
import type { Confirm } from "../components/ConfirmDialog";
import type { MenuItem } from "../components/ContextMenu";
import type { EditMode } from "../components/EditCommit";
import type { Effect } from "../components/Fx";
import type { NameRequest } from "../components/NameDialog";
import type { GraphHandle } from "../graph/GraphCanvas";
import type { Drag } from "../graph/renderer";
import type { Pt } from "../graph/scene";
import type { MissionId } from "../missions";
import type {
  BisectState,
  CommitInfo,
  FileDiff,
  FileTouch,
  OpResult,
  PrReport,
  RebaseStep,
  RepoSnapshot,
  ResetMode,
  StackBranch,
  StackOp,
} from "../types";

/** A button on a toast (e.g. open the pull request just made). */
export interface ToastAction {
  label: string;
  onClick(): void;
}

export type Toast = (kind: "ok" | "err", text: string, action?: ToastAction) => void;

/** Every git write goes through here, one at a time (see `useRun`). */
export type Run = (
  label: string,
  op: () => Promise<OpResult>,
  after?: () => void,
  quiet?: boolean,
) => Promise<OpResult>;

export type DiffSource = { kind: "commit"; id: string } | { kind: "worktree"; scope: "unstaged" | "staged" };

/** The sheet under the graph; opening one replaces the last. (The conflict sheet goes over it, see `Repo.setConflict`.) */
export type Sheet =
  | { kind: "diff"; source: DiffSource; title: string; files: FileDiff[] | null; error: string | null; path?: string }
  | { kind: "backport"; source: string; target: string }
  /** An interactive rebase planned from base commit `from`; `init` is a starting plan (a Shift-drag), else every commit in order. */
  | { kind: "rebase"; from: string; init: RebaseStep[] | null }
  | { kind: "cleanup" }
  | { kind: "reflog" }
  | { kind: "blame"; rev: string; file: string };

/** The repository's own dialog; opening one replaces the last. (Confirmations and the token dialog go over it.) */
export type Dialog =
  | { kind: "name"; req: NameRequest }
  | { kind: "merge"; sourceId: string; targetId: string; source: string; target: string }
  /** "Go back to this commit": the target and what the dialog needs to explain it. */
  | { kind: "reset"; target: string; summary: string; passed: number; pushed: boolean; initial?: ResetMode }
  /** Touching up a past commit: which edit, and its files (loaded for splitting). */
  | { kind: "edit"; mode: EditMode; id: string; files: FileDiff[] | null; rewrites: number; pushed: boolean }
  /** Adding a worktree, maybe for a branch picked from its menu. */
  | { kind: "worktree"; branch?: string }
  /** Release notes up to this ref. */
  | { kind: "notes"; to: string }
  | { kind: "transfer" }
  /** Opening a pull request from this branch. */
  | { kind: "pr"; from: string };

export type BisectDraft = { bad?: string; good?: string };

/** A popup menu at a point on screen. */
export type Menu = { x: number; y: number; title?: string; items: MenuItem[] };

/** One open, loaded repository and what its menus, banners, sheets and dialogs act through. */
export interface Repo {
  path: string;
  snap: RepoSnapshot;
  /** The snapshot last applied, for comparing before / after an operation (not during render). */
  latest(): RepoSnapshot | null;
  busy: boolean;
  pro: boolean;
  commitById: Map<string, CommitInfo>;
  pulls: PrReport | null;
  stacks: StackBranch[];
  bisect: BisectState | null;
  bisectDraft: BisectDraft | null;
  /** Local branches checked out in another worktree → that folder. */
  elsewhere: Record<string, string>;
  /** The commit shown in the panel. */
  selected: string | null;
  colorOf(id: string): string;
  /** The graph's camera and screen positions (not during render). */
  graph(): GraphHandle | null;
  toast: Toast;
  run: Run;
  stackRun(label: string, op: StackOp): Promise<void>;
  /** The right panel shows one thing: composer, a stash, or a commit. */
  show(what: { commit?: string | null; stash?: number | null; composer?: boolean; amend?: boolean }): void;
  setMenu(menu: Menu | null): void;
  /** Where the last menu opened, for a follow-up menu in the same spot. */
  menuAt(): { x: number; y: number };
  setConfirm(c: Confirm | null): void;
  setDialog: Dispatch<SetStateAction<Dialog | null>>;
  setSheet: Dispatch<SetStateAction<Sheet | null>>;
  /** Open the conflict sheet over the current one (at `file`, else the first). */
  setConflict(c: { file?: string } | null): void;
  setBisectDraft(d: BisectDraft | null): void;
  setTrail(t: { file: string; touches: FileTouch[] } | null): void;
  play(e: Effect): void;
  /** Play an effect once the new snapshot is drawn and the camera has come to rest. */
  playAfterDraw(make: (at: (id: string | null | undefined) => Pt | null) => Effect | null): void;
  mission(id: MissionId): void;
  onOpenPath(path: string): void;
  openUrl(url: string): void;
  fetchOne(name: string): Promise<void>;
  canDropOn(target: string, source: string, mode: Drag["mode"]): boolean;
  /** Is `anc` an ancestor of (or) `of`? */
  isAncestor(anc: string, of: string | null): boolean;
}

/** Close the sheet if it is still the `kind` (an answer may land after another opened). */
export const closeSheet = (repo: Pick<Repo, "setSheet">, kind: Sheet["kind"]) =>
  repo.setSheet((s) => (s?.kind === kind ? null : s));

/** Close the dialog if it is still the `kind`. */
export const closeDialog = (repo: Pick<Repo, "setDialog">, kind: Dialog["kind"]) =>
  repo.setDialog((d) => (d?.kind === kind ? null : d));
