import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import { BackportSheet } from "./components/BackportSheet";
import { Composer } from "./components/Composer";
import { ReflogSheet, ResetDialog } from "./components/Undo";
import { CleanupSheet } from "./components/Cleanup";
import { RebaseSheet } from "./components/RebaseSheet";
import { AuthDialog } from "./components/AuthDialog";
import { type Confirm, ConfirmDialog } from "./components/ConfirmDialog";
import { ConflictSheet } from "./components/ConflictSheet";
import { ContextMenu, type MenuItem } from "./components/ContextMenu";
import { NameDialog, type NameRequest } from "./components/NameDialog";
import { DiffSheet } from "./components/DiffSheet";
import { Inspector } from "./components/Inspector";
import { MergeDialog } from "./components/MergeDialog";
import { SearchBar } from "./components/SearchBar";
import { Sidebar } from "./components/Sidebar";
import { StashPanel } from "./components/StashPanel";
import { SyncDialog } from "./components/SyncDialog";
import { TopBar } from "./components/TopBar";
import { GraphCanvas, type GraphHandle } from "./graph/GraphCanvas";
import { ancestors, computeLayout } from "./graph/layout";
import { searchCommits } from "./graph/search";
import { NEON } from "./graph/scene";
import { stashTitle } from "./format";
import { planMove, rebaseRange } from "./rebasePlan";
import type { Settings } from "./settings";
import { isKey, type Key, t } from "./i18n";
import { Rich } from "./i18n/Rich";
import type { Drag } from "./graph/renderer";
import type {
  FileDiff,
  OpResult,
  OpStatus,
  Progress,
  RebaseStep,
  ReflogEntry,
  ResetMode,
  RefInfo,
  RefOp,
  RemoteOp,
  RepoSnapshot,
} from "./types";

type MergeReq = { sourceId: string; targetId: string; source: string; target: string };
type DiffSource = { kind: "commit"; id: string } | { kind: "worktree"; scope: "unstaged" | "staged" };
type DiffState = { source: DiffSource; title: string; files: FileDiff[] | null; error: string | null; path?: string };

const REMOTE_DONE: Record<RemoteOp, Key> = {
  fetch: "remote.done.fetch",
  pull: "remote.done.pull",
  pullMerge: "remote.done.pullMerge",
  pullRebase: "remote.done.pullRebase",
  push: "remote.done.push",
  forcePush: "remote.done.forcePush",
};

/** In-progress operations (`state.<name>` and `.hint` in the dictionary) and whether "continue" applies. */
const IN_PROGRESS: Record<string, { canContinue: boolean }> = {
  merge: { canContinue: false },
  rebase: { canContinue: true },
  "cherry-pick": { canContinue: true },
  revert: { canContinue: true },
};

/** Banner name and hint for a repository state; unknown states show as-is. */
const stateText = (state: string) => {
  const name = `state.${state}`;
  const hint = `state.${state}.hint`;
  return { name: isKey(name) ? t(name) : state, hint: isKey(hint) ? t(hint) : "" };
};

/** URL of the remote behind HEAD's upstream (else `origin`, else the first remote). */
function upstreamUrl(snap: RepoSnapshot): string | null {
  const name = snap.head.upstream?.split("/")[0];
  const r =
    snap.remotes.find((x) => x.name === name) ?? snap.remotes.find((x) => x.name === "origin") ?? snap.remotes[0];
  return r?.url ?? null;
}

export interface RepoViewProps {
  path: string;
  /** The visible tab: only it listens to keys, watches files and draws. */
  active: boolean;
  settings: Settings;
  /** Commits per page (settings, or `?page=` in demos). */
  page: number;
  toast(kind: "ok" | "err", text: string): void;
  /** Loaded for the first time (recent list). */
  onLoaded(path: string): void;
  onSettings(): void;
  onToggleAnimate(): void;
  /** Toggle the repository menu; `repoMenu` is it when open. */
  onRepoMenu(): void;
  repoMenu: ReactNode;
}

/** One open repository: its graph, panels, sheets and every git action on it. */
export function RepoView({
  path,
  active,
  settings,
  page,
  toast,
  onLoaded,
  onSettings,
  onToggleAnimate,
  onRepoMenu,
  repoMenu,
}: RepoViewProps) {
  const [snap, setSnap] = useState<RepoSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState<RemoteOp | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedStash, setSelectedStash] = useState<number | null>(null);
  const [panel, setPanel] = useState<{ id: string; files: FileDiff[] } | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [focusRef, setFocusRef] = useState<RefInfo | null>(null);
  const [composer, setComposer] = useState<false | { amend: boolean }>(false);
  const [menu, setMenu] = useState<{ x: number; y: number; title?: string; items: MenuItem[] } | null>(null);
  const [nameReq, setNameReq] = useState<NameRequest | null>(null);
  const [mergeReq, setMergeReq] = useState<MergeReq | null>(null);
  const [sync, setSync] = useState<"diverged" | "rejected" | null>(null);
  const [auth, setAuth] = useState<{ op: RemoteOp; output: string } | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [diff, setDiff] = useState<DiffState | null>(null);
  const [conflictSheet, setConflictSheet] = useState<{ file?: string } | null>(null);
  const [backport, setBackport] = useState<{ source: string; target: string } | null>(null);
  /** Base commit of an interactive rebase being planned. */
  const [rebaseFrom, setRebaseFrom] = useState<string | null>(null);
  /** Starting plan for the sheet (from a Shift-drag); null starts with every commit picked in order. */
  const [rebaseInit, setRebaseInit] = useState<RebaseStep[] | null>(null);
  /** "Go back to this commit": the target and what the dialog needs to explain it. */
  const [resetReq, setResetReq] = useState<{
    target: string;
    summary: string;
    passed: number;
    pushed: boolean;
    initial?: ResetMode;
  } | null>(null);
  const [reflogOpen, setReflogOpen] = useState(false);
  const [cleanupOpen, setCleanupOpen] = useState(false);
  /** Where deleted branch tips were, to scatter them as stardust (bumped id replays it). */
  const [dust, setDust] = useState<{ n: number; at: { x: number; y: number }[] }>({ n: 0, at: [] });
  /** Bumped after a reset to replay the rewind effect. */
  const [rewind, setRewind] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [limit, setLimit] = useState(page);
  const [search, setSearch] = useState<{ query: string; index: number } | null>(null);
  const animate = settings.animate;
  // A new page size from the settings applies to every open repository.
  const [shownPage, setShownPage] = useState(page);
  if (shownPage !== page) {
    setShownPage(page);
    setLimit(page);
  }
  const graph = useRef<GraphHandle>(null);
  const diffReq = useRef(0);

  const applySnapshot = useCallback((s: RepoSnapshot) => {
    setSnap(s);
    setLoadError(null);
  }, []);
  const refresh = useCallback(async () => {
    await api.snapshot(path, limit).then(applySnapshot, (e) => setLoadError(String(e)));
  }, [path, limit, applySnapshot]);

  // First load for a repo / history size. A response for a repo we have since
  // left is dropped.
  useEffect(() => {
    let live = true;
    api.snapshot(path, limit).then(
      (s) => {
        if (!live) return;
        applySnapshot(s);
        onLoaded(path);
      },
      (e) => live && setLoadError(String(e)),
    );
    return () => {
      live = false;
    };
  }, [path, limit, applySnapshot, onLoaded]);

  // Files and refs changed on disk (editor, terminal git) → refresh. Only the
  // visible tab watches; switching to a tab refreshes it.
  useEffect(() => {
    if (!active) return;
    void refresh();
    let stop = () => {};
    let live = true;
    api
      .watch(path, () => void refresh())
      .then(
        (un) => (live ? (stop = un) : un()),
        () => {}, // watching is a convenience; focus refresh still works
      );
    return () => {
      live = false;
      stop();
    };
  }, [path, active, refresh]);

  // Pick up edits made in an editor when the user comes back to the window.
  useEffect(() => {
    if (!active) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, refresh]);

  const stashSel = selectedStash !== null ? snap?.stashes[selectedStash] : undefined;
  /** The right panel shows one thing: composer, a stash, or a commit. */
  const show = (what: { commit?: string | null; stash?: number | null; composer?: boolean; amend?: boolean }) => {
    setSelected(what.commit ?? null);
    setSelectedStash(what.stash ?? null);
    setComposer(what.composer ? { amend: what.amend ?? false } : false);
  };

  // Changed files of the selected commit or stash (a stash is a commit too), for the side panel.
  const panelId = stashSel?.id ?? selected;
  useEffect(() => {
    if (!panelId) return;
    let live = true;
    api
      .commitDiff(path, panelId)
      .then((files) => live && setPanel({ id: panelId, files }))
      .catch(() => live && setPanel({ id: panelId, files: [] }));
    return () => {
      live = false;
    };
  }, [path, panelId]);
  // Files loaded for another commit don't count: show "loading" until ours arrive.
  const panelFiles = panel && panel.id === panelId ? panel.files : null;

  /** Fetch the files for the open diff; only the latest request may land. */
  const fetchDiff = useCallback(
    (source: DiffSource) => {
      if (!path) return;
      const req = ++diffReq.current;
      const load =
        source.kind === "commit" ? api.commitDiff(path, source.id) : api.worktreeDiff(path, null, source.scope);
      load.then(
        (files) => req === diffReq.current && setDiff((d) => d && { ...d, files }),
        (e) => req === diffReq.current && setDiff((d) => d && { ...d, files: [], error: String(e) }),
      );
    },
    [path],
  );

  const loadDiff = useCallback(
    (source: DiffSource, title: string, file?: string) => {
      setBackport(null);
      setRebaseFrom(null);
      setDiff((d) => ({ source, title, files: d?.title === title ? d.files : null, error: null, path: file }));
      fetchDiff(source);
    },
    [fetchDiff],
  );

  // The working-tree diff follows the files on disk (only the files are refetched).
  const worktreeSource = diff?.source.kind === "worktree" ? diff.source : null;
  useEffect(() => {
    if (worktreeSource) fetchDiff(worktreeSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  const layout = useMemo(() => (snap ? computeLayout(snap.commits, snap.refs, snap.head) : null), [snap]);
  const summaries = useMemo(() => new Map(snap?.commits.map((c) => [c.id, c.summary]) ?? []), [snap]);
  const commitById = useMemo(() => new Map(snap?.commits.map((c) => [c.id, c]) ?? []), [snap]);
  const backportTargets = useMemo(
    () => (snap?.refs ?? []).filter((r) => r.kind === "local").map((r) => r.name),
    [snap],
  );
  // Commits the planned rebase rewrites; null when there is nothing valid to plan.
  const rebase = useMemo(() => {
    if (!rebaseFrom || !snap?.head.target) return null;
    const r = rebaseRange(commitById, snap.head.target, rebaseFrom);
    return typeof r === "string" || r.length === 0 ? null : r;
  }, [rebaseFrom, snap, commitById]);
  const matches = useMemo(
    () => (snap && search ? searchCommits(snap.commits, snap.refs, search.query) : []),
    [snap, search?.query], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Search highlights its matches; otherwise a focused branch highlights its ancestry.
  const focus = useMemo(() => {
    if (search?.query.trim()) return new Set(matches);
    return snap && focusRef ? ancestors(snap.commits, focusRef.target) : null;
  }, [snap, focusRef, search?.query, matches]);

  /** Select match `i` (wrapping) and fly the camera to it. */
  const goToMatch = (i: number, list = matches) => {
    if (!list.length) return;
    const index = (i + list.length) % list.length;
    setSearch((s) => s && { ...s, index });
    show({ commit: list[index] });
    graph.current?.centerOn(list[index]);
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearch((s) => s ?? { query: "", index: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);
  const colorOf = useCallback((id: string) => NEON[layout?.byId.get(id)?.color ?? 0], [layout]);

  /** Local branch a merge can land on at commit `id`. */
  const branchAt = useCallback(
    (id: string): string | null => {
      if (!snap) return null;
      if (snap.head.target === id && snap.head.branch) return snap.head.branch;
      return snap.refs.find((r) => r.kind === "local" && r.target === id)?.name ?? null;
    },
    [snap],
  );

  const ancestorCache = useRef(new Map<string, Set<string>>());
  useEffect(() => {
    ancestorCache.current.clear();
  }, [snap]);
  const isAncestor = (anc: string, of: string | null) => {
    if (!snap || !of) return false;
    let set = ancestorCache.current.get(of);
    if (!set) {
      set = ancestors(snap.commits, of);
      ancestorCache.current.set(of, set);
    }
    return set.has(anc);
  };
  const canDropOn = useCallback(
    (target: string, source: string, mode: Drag["mode"]) => {
      if (!snap || snap.state !== "clean") return false;
      if (mode === "move") return !!snap.head.target && !!planMove(commitById, snap.head.target, source, target);
      if (!branchAt(target)) return false;
      return !isAncestor(source, target); // already contained otherwise
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, branchAt, commitById],
  );

  const sourceName = (id: string, target: string): string => {
    const refs = snap?.refs.filter((r) => r.target === id && r.kind !== "tag" && r.name !== target) ?? [];
    return (refs.find((r) => r.kind === "local") ?? refs[0])?.name ?? id;
  };

  /**
   * Every git write goes through here: busy state, toasts, refresh.
   * Statuses that need a follow-up dialog (diverged / rejected / auth) are left to the caller.
   */
  async function run(label: string, op: () => Promise<OpResult>, after?: () => void): Promise<OpResult> {
    let r: OpResult = { status: "failed", output: "" };
    setBusy(true);
    try {
      r = await op();
      if (r.status === "ok") {
        toast("ok", label);
        after?.();
      } else if (r.status === "conflict") {
        toast("err", t("app.conflict"));
        setConflictSheet({});
      } else if (r.status === "failed") toast("err", r.output || t("app.failed", { label }));
    } catch (e) {
      toast("err", String(e));
    } finally {
      setBusy(false);
      await refresh();
    }
    return r;
  }

  const remote = async (op: RemoteOp): Promise<OpStatus> => {
    setRemoteBusy(op);
    setProgress(null);
    try {
      const r = await run(t(REMOTE_DONE[op]), () => api.remote(path, op, setProgress));
      if (r.status === "auth") setAuth({ op, output: r.output });
      if (r.status === "diverged" || r.status === "rejected") setSync(r.status);
      // A rejected push says nothing about how far behind we are; fetch so the dialog can show it.
      if (r.status === "rejected") await api.remote(path, "fetch").then(refresh, () => {});
      return r.status;
    } finally {
      setRemoteBusy(null);
      setProgress(null);
    }
  };

  /** Resolve a diverged pull or rejected push with merge/rebase (then push for the latter). */
  const resolveSync = async (op: "pullMerge" | "pullRebase") => {
    const wasRejected = sync === "rejected";
    setSync(null);
    if ((await remote(op)) === "ok" && wasRejected) await remote("push");
  };

  /** Copy commit `id` onto branch `target` (checked out first), after confirming. */
  const confirmPick = (id: string, target: string) => {
    const summary = commitById.get(id)?.summary ?? id.slice(0, 7);
    setConfirm({
      title: "cherry-pick",
      confirmLabel: t("pick.copy"),
      body: (
        <>
          <p>
            <Rich k="pick.body" vars={{ summary, target }} />
          </p>
          {snap?.head.branch !== target && <p className="note">{t("pick.switch", { target })}</p>}
        </>
      ),
      onConfirm: () => {
        setConfirm(null);
        void run(
          t("pick.done", { target }),
          () => api.pick(path, "cherryPick", id, target),
          () => setTimeout(() => graph.current?.centerOnHead(), 60),
        );
      },
    });
  };

  const refRun = (label: string, op: RefOp) => run(label, () => api.ref(path, op));

  const checkoutRef = (r: RefInfo) =>
    r.kind === "remote"
      ? refRun(t("checkout.remote.done", { name: r.name }), { kind: "checkoutRemote", remoteRef: r.name })
      : run(t("checkout.done", { name: r.name }), () => api.checkout(path, r.name));

  const askBranchAt = (at: string) =>
    setNameReq({
      title: t("branch.new.title", { sha: at.slice(0, 7) }),
      placeholder: "feature/my-idea",
      confirmLabel: t("branch.new.go"),
      onSubmit: (name) => {
        setNameReq(null);
        void run(t("branch.new.done", { name }), () => api.createBranch(path, name, at, true));
      },
    });

  const askTagAt = (at: string) =>
    setNameReq({
      title: t("tag.new.title", { sha: at.slice(0, 7) }),
      placeholder: "v1.0.0",
      confirmLabel: t("tag.new.go"),
      extra: { placeholder: t("tag.new.message"), multiline: true },
      onSubmit: (name, message) => {
        setNameReq(null);
        void refRun(t("tag.new.done", { name }), { kind: "createTag", name, at, message });
      },
    });

  /** Add another repository (e.g. the original project) as a remote and fetch it. */
  const askRemote = () =>
    setNameReq({
      title: t("remote.add.title"),
      placeholder: snap?.remotes.some((r) => r.name === "upstream")
        ? t("remote.add.name")
        : t("remote.add.nameExample"),
      extra: { placeholder: t("remote.add.url"), required: true },
      confirmLabel: t("remote.add.go"),
      onSubmit: async (name, url) => {
        setNameReq(null);
        const r = await refRun(t("remote.add.done", { name }), { kind: "addRemote", name, url });
        if (r.status === "ok") await remote("fetch");
      },
    });

  /** Delete a local branch; if git says it's unmerged, ask again before forcing. */
  const deleteBranch = (name: string) =>
    setConfirm({
      title: t("branch.delete.title"),
      danger: true,
      confirmLabel: t("common.delete"),
      body: (
        <p>
          <Rich k="branch.delete.body" vars={{ name }} />
        </p>
      ),
      onConfirm: async () => {
        setConfirm(null);
        const r = await refRun(t("branch.delete.done", { name }), { kind: "deleteBranch", name, force: false });
        if (r.status !== "unmerged") return;
        setConfirm({
          title: t("branch.unmerged.title"),
          danger: true,
          confirmLabel: t("branch.unmerged.go"),
          body: (
            <p>
              <Rich k="branch.unmerged.body" vars={{ name }} />
            </p>
          ),
          onConfirm: () => {
            setConfirm(null);
            void refRun(t("branch.delete.done", { name }), { kind: "deleteBranch", name, force: true });
          },
        });
      },
    });

  /** Delete branches together; their tips scatter as stardust where they were drawn. */
  const deleteBranches = (names: string[], tips: string[], force: boolean) => {
    const at = tips.flatMap((id) => graph.current?.screenOf(id) ?? []);
    return run(
      t("clean.done", { n: names.length }),
      () => api.deleteBranches(path, names, force),
      () => setDust((d) => ({ n: d.n + 1, at })),
    );
  };

  /** Move the branch to `target` with `mode`, then play the rewind. */
  const doReset = (target: string, mode: ResetMode, label = t("undo.done", { branch: snap?.head.branch ?? "HEAD" })) =>
    run(
      label,
      () => api.reset(path, target, mode),
      () => {
        setResetReq(null);
        setRewind((n) => n + 1);
        setTimeout(() => graph.current?.centerOnHead(), 60);
      },
    );

  /** Ask how to go back to `target` (a commit, maybe one only the reflog knows). */
  const askReset = (target: string, initial?: ResetMode, summary?: string) => {
    if (!snap?.head.target) return;
    // Commits leaving the branch; unknown for a commit only the reflog has (it isn't loaded).
    const passed = commitById.has(target)
      ? [...ancestors(snap.commits, snap.head.target)].filter((c) => !isAncestor(c, target)).length
      : 0;
    setResetReq({
      target,
      summary: summary ?? commitById.get(target)?.summary ?? target.slice(0, 7),
      passed,
      // More commits leave the branch than are unpushed: some were pushed.
      pushed: !!snap.head.upstream && passed > snap.head.ahead,
      initial,
    });
  };

  /** Right-click menu for a ref badge (graph) or a sidebar row. */
  const refMenu = (r: RefInfo): MenuItem[] => {
    if (!snap) return [];
    const isHead = r.kind === "local" && r.name === snap.head.branch;
    const canMerge =
      !!snap.head.branch && !isHead && r.kind !== "tag" && canDropOn(snap.head.target ?? "", r.target, "merge");
    const merge: MenuItem = {
      label: snap.head.branch ? t("menu.mergeInto", { branch: snap.head.branch }) : t("menu.mergeIntoHead"),
      disabled: !canMerge,
      onSelect: () =>
        setMergeReq({ sourceId: r.target, targetId: snap.head.target!, source: r.name, target: snap.head.branch! }),
    };
    const compare: MenuItem = {
      label: snap.head.branch ? t("menu.compare", { branch: snap.head.branch }) : t("menu.compareHead"),
      hint: t("menu.compare.hint"),
      disabled: !snap.head.branch || isHead,
      onSelect: () => {
        setDiff(null);
        setRebaseFrom(null);
        setBackport({ source: r.name, target: snap.head.branch! });
      },
    };
    if (r.kind === "tag")
      return [
        { label: t("menu.tag.goto"), onSelect: () => graph.current?.centerOn(r.target) },
        "separator",
        {
          label: t("tag.delete.title"),
          danger: true,
          onSelect: () =>
            setConfirm({
              title: t("tag.delete.title"),
              danger: true,
              confirmLabel: t("common.delete"),
              body: (
                <p>
                  <Rich k="tag.delete.body" vars={{ name: r.name }} />
                </p>
              ),
              onConfirm: () => {
                setConfirm(null);
                void refRun(t("tag.delete.done", { name: r.name }), { kind: "deleteTag", name: r.name });
              },
            }),
        },
      ];
    if (r.kind === "remote") {
      const name = snap.remotes.map((x) => x.name).find((n) => r.name.startsWith(`${n}/`)) ?? r.name.split("/")[0];
      return [
        { label: t("menu.checkoutLocal"), hint: t("menu.checkoutLocal.hint"), onSelect: () => void checkoutRef(r) },
        merge,
        compare,
        "separator",
        { label: t("menu.branchHere"), onSelect: () => askBranchAt(r.target) },
        "separator",
        {
          label: t("remote.delete.menu", { name }),
          danger: true,
          onSelect: () =>
            setConfirm({
              title: t("remote.delete.title"),
              danger: true,
              confirmLabel: t("common.delete"),
              body: (
                <p>
                  <Rich k="remote.delete.body" vars={{ name }} />
                </p>
              ),
              onConfirm: () => {
                setConfirm(null);
                void refRun(t("remote.delete.done", { name }), { kind: "removeRemote", name });
              },
            }),
        },
      ];
    }
    return [
      { label: t("menu.checkout"), disabled: isHead, onSelect: () => void checkoutRef(r) },
      merge,
      compare,
      "separator",
      {
        label: t("menu.rename"),
        onSelect: () =>
          setNameReq({
            title: t("branch.rename.title"),
            placeholder: t("branch.rename.placeholder"),
            confirmLabel: t("branch.rename.go"),
            initial: r.name,
            onSubmit: (to) => {
              setNameReq(null);
              void refRun(t("branch.rename.done", { name: to }), { kind: "renameBranch", from: r.name, to });
            },
          }),
      },
      { label: t("menu.tagHere"), onSelect: () => askTagAt(r.target) },
      "separator",
      { label: t("menu.deleteBranch"), danger: true, disabled: isHead, onSelect: () => deleteBranch(r.name) },
    ];
  };

  /** Right-click menu for a commit node; entries that don't apply are disabled, not hidden. */
  const nodeMenu = (id: string): MenuItem[] => {
    if (!snap) return [];
    const head = snap.head.target;
    const isHead = id === head;
    const onHead = isAncestor(id, head);
    const clean = snap.state === "clean";
    const locals = snap.refs.filter((r) => r.kind === "local" && r.target === id && r.name !== snap.head.branch);
    const summary = commitById.get(id)?.summary ?? id.slice(0, 7);
    const range = onHead && !isHead && head ? rebaseRange(commitById, head, id) : null;
    return [
      { label: t("menu.branchHere"), onSelect: () => askBranchAt(id) },
      { label: t("menu.tagHere"), onSelect: () => askTagAt(id) },
      ...locals.map((r) => ({
        label: t("menu.checkoutName", { name: r.name }),
        onSelect: () => void run(t("checkout.done", { name: r.name }), () => api.checkout(path, r.name)),
      })),
      "separator" as const,
      {
        label: snap.head.branch ? t("menu.pickInto", { branch: snap.head.branch }) : t("menu.pickIntoHead"),
        hint: t("menu.pick.hint"),
        disabled: !clean || onHead || !snap.head.branch,
        onSelect: () => confirmPick(id, snap.head.branch!),
      },
      {
        label: t("menu.revert"),
        disabled: !clean || !onHead,
        onSelect: () =>
          setConfirm({
            title: "revert",
            confirmLabel: t("revert.go"),
            body: (
              <p>
                <Rich k="revert.body" vars={{ summary, branch: snap.head.branch ?? "HEAD" }} />
              </p>
            ),
            onConfirm: () => {
              setConfirm(null);
              void run(t("revert.done"), () => api.pick(path, "revert", id, null));
            },
          }),
      },
      {
        label: t("menu.amend"),
        disabled: !isHead || !clean,
        onSelect: () => show({ composer: true, amend: true }),
      },
      {
        label: t("undo.lastCommit"),
        disabled: !isHead || !clean || !commitById.get(id)?.parents.length,
        onSelect: () => {
          const parent = commitById.get(id)!.parents[0];
          // Already pushed: explain the force push first; otherwise just do it.
          if (snap.head.upstream && snap.head.ahead === 0) askReset(parent, "soft");
          else void doReset(parent, "soft", t("undo.lastCommit.done"));
        },
      },
      {
        label: t("undo.toHere"),
        disabled: !clean || !onHead || isHead,
        onSelect: () => askReset(id),
      },
      {
        label: t("menu.rebase"),
        hint: typeof range === "string" ? t("menu.rebase.hasMerge") : undefined,
        disabled: !clean || !snap.head.branch || !onHead || isHead || typeof range === "string",
        onSelect: () => {
          setDiff(null);
          setBackport(null);
          setRebaseInit(null);
          setRebaseFrom(id);
        },
      },
      "separator" as const,
      { label: t("menu.copySha"), hint: id.slice(0, 7), onSelect: () => void navigator.clipboard?.writeText(id) },
    ];
  };

  // --- loading / error states -------------------------------------------------
  if (!snap && loadError)
    return (
      <div className="welcome" hidden={!active}>
        <p className="note warn">{loadError}</p>
      </div>
    );
  if (!snap || !layout)
    return (
      <div className="welcome loading" hidden={!active}>
        {t("app.loading")}
      </div>
    );

  const selectedCommit = selected ? commitById.get(selected) : undefined;
  const conflicts = snap.changes.filter((c) => c.conflicted).length;
  const headColor = colorOf(snap.head.target ?? "");

  return (
    <div className="app" hidden={!active}>
      {/* Only the visible tab has a top bar, so window-level lookups find one. */}
      {active && (
        <TopBar
          repoName={snap.name}
          repoPath={snap.path}
          head={snap.head}
          headColor={headColor}
          changeCount={snap.changes.length}
          busy={busy}
          remoteBusy={remoteBusy}
          progress={progress}
          animate={animate}
          onOpenRepo={onRepoMenu}
          repoMenu={repoMenu}
          onCompose={() => show({ composer: true })}
          onRefresh={() => void refresh()}
          onUndoHistory={() => {
            setDiff(null);
            setBackport(null);
            setRebaseFrom(null);
            setCleanupOpen(false);
            setReflogOpen((o) => !o);
          }}
          onRemote={(op) => void remote(op)}
          onToggleAnimate={onToggleAnimate}
          onSettings={onSettings}
        />
      )}

      {snap.state !== "clean" && (
        <div className="banner">
          <span>
            {t("state.banner", { name: stateText(snap.state).name })}
            {conflicts > 0 && t("state.conflicts", { n: conflicts })}. {stateText(snap.state).hint}
          </span>
          <span className="row">
            {conflicts > 0 && <button onClick={() => setConflictSheet({})}>{t("state.resolve")}</button>}
            {IN_PROGRESS[snap.state]?.canContinue && (
              <button disabled={busy} onClick={() => run(t("state.continued"), () => api.continueOp(path))}>
                {t("state.continue")}
              </button>
            )}
            <button disabled={busy} onClick={() => run(t("state.aborted"), () => api.abort(path))}>
              {t("common.cancel")}
            </button>
          </span>
        </div>
      )}

      <div className="main">
        <Sidebar
          refs={snap.refs}
          headBranch={snap.head.branch}
          colorOf={colorOf}
          focused={focusRef ? `${focusRef.kind}:${focusRef.name}` : null}
          onFocus={(r) => {
            setFocusRef(r);
            if (r) graph.current?.centerOn(r.target);
          }}
          onCheckout={checkoutRef}
          onAddRemote={askRemote}
          onCleanup={() => {
            setDiff(null);
            setBackport(null);
            setRebaseFrom(null);
            setReflogOpen(false);
            setCleanupOpen((o) => !o);
          }}
          onRefMenu={(r, x, y) => setMenu({ x, y, title: r.name, items: refMenu(r) })}
          stashes={snap.stashes}
          selectedStash={selectedStash}
          onStash={(i) => {
            show({ stash: i });
            const base = snap.stashes[i]?.base;
            if (base) graph.current?.centerOn(base);
          }}
        />

        <section className="stage">
          <div className="stage-graph">
            {search && (
              <SearchBar
                query={search.query}
                count={matches.length}
                index={search.index}
                onQuery={(query) => {
                  setSearch({ query, index: 0 });
                  if (snap) goToMatch(0, searchCommits(snap.commits, snap.refs, query));
                }}
                onStep={(d) => goToMatch(search.index + d)}
                onClose={() => setSearch(null)}
              />
            )}
            {animate && dust.n > 0 && (
              <div className="fx-clip" aria-hidden key={`dust-${dust.n}`}>
                {dust.at.map((p, i) => (
                  <div key={i} className="stardust" style={{ left: p.x, top: p.y }}>
                    {Array.from({ length: 16 }, (_, j) => (
                      <i
                        key={j}
                        style={{
                          ["--a" as string]: `${j * 22.5}deg`,
                          ["--d" as string]: `${44 + ((j * 7) % 5) * 13}px`,
                        }}
                      />
                    ))}
                  </div>
                ))}
              </div>
            )}
            {animate && rewind > 0 && (
              <div className="fx-clip" aria-hidden>
                <div key={rewind} className="rewind" />
              </div>
            )}
            <GraphCanvas
              ref={graph}
              layout={layout}
              refs={snap.refs}
              summaries={summaries}
              headId={snap.head.target}
              headBranch={snap.head.branch}
              changeCount={snap.changes.length}
              selected={selected}
              focus={focus}
              animate={animate}
              onSelect={(id) => (id || !composer ? show({ commit: id }) : undefined)}
              onPlus={() => show({ composer: true })}
              stashes={snap.stashes}
              selectedStash={selectedStash}
              onStash={(i) => show({ stash: i })}
              canDropOn={canDropOn}
              onDrop={(sourceId, targetId, mode) => {
                if (mode === "move") {
                  const plan = planMove(commitById, snap.head.target!, sourceId, targetId);
                  if (!plan) return;
                  setDiff(null);
                  setBackport(null);
                  setRebaseInit(plan.steps);
                  setRebaseFrom(plan.base);
                  return;
                }
                const target = branchAt(targetId)!;
                if (mode === "merge")
                  return setMergeReq({ sourceId, targetId, target, source: sourceName(sourceId, target) });
                confirmPick(sourceId, target);
              }}
              incoming={snap.incoming}
              truncated={snap.truncated}
              onLoadMore={() => setLimit((l) => l + page)}
              onNodeMenu={(id, x, y) => setMenu({ x, y, title: commitById.get(id)?.summary, items: nodeMenu(id) })}
              onRefMenu={(r, x, y) => setMenu({ x, y, title: r.name, items: refMenu(r) })}
              onZoomChange={setZoom}
            />

            {snap.commits.length === 0 && (
              <div className="empty-hint">
                <Rich k="app.empty" />
              </div>
            )}

            <div className="hud">
              <button onClick={() => graph.current?.zoomBy(0.8)} title={t("hud.zoomOut")}>
                −
              </button>
              <span className="zoom">{Math.round(zoom * 100)}%</span>
              <button onClick={() => graph.current?.zoomBy(1.25)} title={t("hud.zoomIn")}>
                ＋
              </button>
              <button onClick={() => graph.current?.fit()} title={t("hud.fit")}>
                ⤢
              </button>
              <button onClick={() => graph.current?.centerOnHead()} title={t("hud.head")}>
                ◉
              </button>
            </div>
            <div className="hint">
              {t("graph.hint")}
              {snap.truncated && t("graph.hint.truncated", { n: snap.commits.length })}
            </div>
          </div>

          {conflictSheet && (
            <ConflictSheet
              path={path}
              files={snap.changes.filter((c) => c.conflicted).map((c) => c.path)}
              state={snap.state}
              initialFile={conflictSheet.file}
              busy={busy}
              onResolve={(file, how) => void run(t("conflict.resolved", { file }), () => api.resolve(path, file, how))}
              onClose={() => setConflictSheet(null)}
            />
          )}

          {rebase && !conflictSheet && (
            <RebaseSheet
              // Fresh plan whenever the history under it changes.
              key={`${rebaseFrom}:${snap.head.target}:${rebaseInit?.map((x) => x.id).join() ?? ""}`}
              branch={snap.head.branch ?? "HEAD"}
              base={commitById.get(rebaseFrom!)!}
              commits={rebase}
              initial={rebaseInit}
              unpushed={snap.head.upstream ? snap.head.ahead : null}
              busy={busy}
              onApply={(steps) =>
                void run(
                  t("rebase.done"),
                  () => api.rebase(path, rebaseFrom!, steps),
                  () => setRebaseFrom(null),
                )
              }
              onClose={() => setRebaseFrom(null)}
            />
          )}

          {backport && !conflictSheet && (
            <BackportSheet
              path={path}
              branches={snap.refs.filter((r) => r.kind !== "tag").map((r) => r.name)}
              targets={backportTargets}
              remoteCount={snap.remotes.length}
              onAddRemote={askRemote}
              source={backport.source}
              target={backport.target}
              version={snap}
              busy={busy}
              onPair={(source, target) => setBackport({ source, target })}
              onSelect={(id) => {
                show({ commit: id });
                graph.current?.centerOn(id);
              }}
              onApply={(ids) =>
                setConfirm({
                  title: t("backport.confirm.title"),
                  confirmLabel: t("backport.confirm.go", { n: ids.length }),
                  body: (
                    <p>
                      <Rich
                        k="backport.confirm.body"
                        vars={{ source: backport.source, target: backport.target, n: ids.length }}
                      />
                      {snap.head.branch !== backport.target &&
                        t("backport.confirm.switch", { target: backport.target })}
                    </p>
                  ),
                  onConfirm: () => {
                    setConfirm(null);
                    void run(t("backport.done", { n: ids.length, target: backport.target }), () =>
                      api.backportApply(path, ids, backport.target),
                    );
                  },
                })
              }
              onExport={async (ids) => {
                const dir = await api.pickFolder(t("backport.exportFolder"));
                if (dir) void run(t("backport.exported", { n: ids.length }), () => api.backportExport(path, ids, dir));
              }}
              onClose={() => setBackport(null)}
            />
          )}

          {cleanupOpen && !conflictSheet && !backport && !rebase && !reflogOpen && (
            <CleanupSheet
              path={path}
              version={snap}
              busy={busy}
              colorOf={colorOf}
              onSelect={(id) => {
                show({ commit: id });
                graph.current?.centerOn(id);
              }}
              onDelete={(branches, unmerged) => {
                const names = branches.map((b) => b.name);
                const go = () =>
                  void deleteBranches(
                    names,
                    branches.map((b) => b.tip),
                    unmerged,
                  );
                if (!unmerged) return go();
                setConfirm({
                  title: t("clean.force.title"),
                  danger: true,
                  confirmLabel: t("clean.force.go"),
                  body: (
                    <p>
                      <Rich
                        k="clean.force.body"
                        vars={{
                          names: branches
                            .filter((b) => !b.merged)
                            .map((b) => b.name)
                            .join(", "),
                        }}
                      />
                    </p>
                  ),
                  onConfirm: () => {
                    setConfirm(null);
                    go();
                  },
                });
              }}
              onClose={() => setCleanupOpen(false)}
            />
          )}

          {reflogOpen && !conflictSheet && !backport && !rebase && (
            <ReflogSheet
              path={path}
              version={snap}
              head={snap.head.target}
              busy={busy}
              onSelect={(id) => {
                if (!commitById.has(id)) return;
                show({ commit: id });
                graph.current?.centerOn(id);
              }}
              onResetTo={(e: ReflogEntry) => askReset(e.id, "mixed", e.summary)}
              onRescue={(e: ReflogEntry) =>
                setNameReq({
                  title: t("undo.log.rescue.title", { sha: e.id.slice(0, 7) }),
                  placeholder: `rescue/${e.id.slice(0, 7)}`,
                  initial: "",
                  confirmLabel: t("undo.log.rescue"),
                  onSubmit: (name) => {
                    setNameReq(null);
                    void run(
                      t("undo.log.rescued", { name }),
                      () => api.createBranch(path, name, e.id, false),
                      () => setTimeout(() => graph.current?.centerOn(e.id), 120),
                    );
                  },
                })
              }
              onClose={() => setReflogOpen(false)}
            />
          )}

          {diff && !conflictSheet && !backport && !rebase && !reflogOpen && !cleanupOpen && (
            <DiffSheet
              title={diff.title}
              files={diff.files}
              error={diff.error}
              initialPath={diff.path}
              stage={
                diff.source.kind === "worktree"
                  ? {
                      scope: diff.source.scope,
                      busy,
                      onScope: (scope) => loadDiff({ kind: "worktree", scope }, diff.title, diff.path),
                      onHunk: (file, hunk, lines) =>
                        void run(
                          diff.source.kind === "worktree" && diff.source.scope === "staged"
                            ? t("stage.unstaged")
                            : t("stage.staged"),
                          () =>
                            api.stageHunks(
                              path,
                              file,
                              [hunk],
                              diff.source.kind === "worktree" && diff.source.scope === "staged",
                              lines,
                            ),
                        ),
                    }
                  : undefined
              }
              onClose={() => setDiff(null)}
            />
          )}
        </section>

        {composer && (
          <Composer
            changes={snap.changes}
            branch={snap.head.branch}
            merging={snap.state === "merge"}
            busy={busy}
            headMessage={snap.head.target ? (commitById.get(snap.head.target)?.message ?? "") : null}
            startAmend={composer.amend}
            headPushed={!!snap.head.upstream && snap.head.ahead === 0}
            onClose={() => setComposer(false)}
            onOpenFile={(file) => {
              const c = snap.changes.find((x) => x.path === file);
              if (c?.conflicted) return setConflictSheet({ file });
              // Fully staged files have nothing in the "unstaged" view.
              loadDiff({ kind: "worktree", scope: c?.unstaged ? "unstaged" : "staged" }, t("diff.worktree"), file);
            }}
            onStash={(message, paths) =>
              run(
                t("stash.saved"),
                () => api.stashPush(path, message, paths),
                () => {
                  show({});
                  setDiff((d) => (d?.source.kind === "worktree" ? null : d));
                },
              )
            }
            onDiscard={(paths) =>
              setConfirm({
                title: t("discard.title"),
                danger: true,
                confirmLabel: t("discard.go", { n: paths.length }),
                body: (
                  <>
                    <p>
                      <Rich k="discard.body" /> <b>{t("discard.warn")}</b> {t("discard.hint")}
                    </p>
                    <ul>
                      {paths.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </>
                ),
                onConfirm: () => {
                  setConfirm(null);
                  void run(t("discard.done"), () => api.discard(path, paths));
                },
              })
            }
            onCommit={(message, paths, newBranch, amend, stagedOnly) =>
              run(
                amend ? t("commit.amended") : t("commit.done"),
                async () => {
                  if (newBranch) {
                    const r = await api.createBranch(path, newBranch, null, true);
                    if (r.status !== "ok") return r;
                  }
                  return api.commit(path, message, paths, amend, stagedOnly);
                },
                () => {
                  setComposer(false);
                  setDiff((d) => (d?.source.kind === "worktree" ? null : d));
                  setTimeout(() => graph.current?.centerOnHead(), 60);
                },
              )
            }
          />
        )}

        {!composer && selectedCommit && (
          <Inspector
            commit={selectedCommit}
            refs={snap.refs.filter((r) => r.target === selectedCommit.id)}
            files={panelFiles}
            color={colorOf(selectedCommit.id)}
            isHead={selectedCommit.id === snap.head.target}
            busy={busy}
            onClose={() => setSelected(null)}
            onSelect={(id) => {
              setSelected(id);
              graph.current?.centerOn(id);
            }}
            onOpenFile={(file) =>
              loadDiff({ kind: "commit", id: selectedCommit.id }, selectedCommit.summary || selectedCommit.id, file)
            }
            onCheckout={(name) => run(t("checkout.done", { name }), () => api.checkout(path, name))}
            onCreateBranch={(name, at) =>
              run(t("branch.new.done", { name }), () => api.createBranch(path, name, at, true))
            }
          />
        )}
        {stashSel && !composer && (
          <StashPanel
            stash={stashSel}
            files={panelFiles}
            busy={busy}
            onClose={() => show({})}
            onSelectBase={() => {
              show({ commit: stashSel.base });
              graph.current?.centerOn(stashSel.base);
            }}
            onOpenFile={(file) => loadDiff({ kind: "commit", id: stashSel.id }, stashTitle(stashSel.message), file)}
            onPop={() =>
              run(
                t("stash.popped"),
                () => api.stash(path, "pop", stashSel.index),
                () => show({}),
              )
            }
            onApply={() => run(t("stash.applied"), () => api.stash(path, "apply", stashSel.index))}
            onDrop={() =>
              setConfirm({
                title: t("stash.delete.title"),
                danger: true,
                confirmLabel: t("common.delete"),
                body: <p>{t("stash.delete.body", { name: stashTitle(stashSel.message) })}</p>,
                onConfirm: () => {
                  setConfirm(null);
                  void run(
                    t("stash.deleted"),
                    () => api.stash(path, "drop", stashSel.index),
                    () => show({}),
                  );
                },
              })
            }
          />
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={() => setMenu(null)} />
      )}

      {nameReq && <NameDialog req={nameReq} busy={busy} onCancel={() => setNameReq(null)} />}

      {confirm && <ConfirmDialog confirm={confirm} busy={busy} onCancel={() => setConfirm(null)} />}

      {resetReq && (
        <ResetDialog
          branch={snap.head.branch ?? "HEAD"}
          summary={resetReq.summary}
          passed={resetReq.passed}
          pushed={resetReq.pushed}
          dirty={snap.changes.length}
          initial={resetReq.initial}
          busy={busy}
          onCancel={() => setResetReq(null)}
          onReset={(mode) => void doReset(resetReq.target, mode)}
        />
      )}

      {mergeReq && (
        <MergeDialog
          source={mergeReq.source.length === 40 ? mergeReq.source.slice(0, 7) : mergeReq.source}
          target={mergeReq.target}
          sourceColor={colorOf(mergeReq.sourceId)}
          targetColor={colorOf(mergeReq.targetId)}
          switchesBranch={snap.head.branch !== mergeReq.target}
          dirty={snap.changes.length}
          busy={busy}
          onCancel={() => setMergeReq(null)}
          onConfirm={() =>
            run(t("merge.done", { source: mergeReq.source, target: mergeReq.target }), () =>
              api.merge(path, mergeReq.source, mergeReq.target),
            ).then(() => {
              setMergeReq(null);
              setTimeout(() => graph.current?.centerOnHead(), 60);
            })
          }
        />
      )}

      {sync && snap.head.branch && snap.head.upstream && (
        <SyncDialog
          kind={sync}
          branch={snap.head.branch}
          upstream={snap.head.upstream}
          ahead={snap.head.ahead}
          behind={snap.head.behind}
          color={headColor}
          busy={busy}
          onMerge={() => void resolveSync("pullMerge")}
          onForce={() => {
            setSync(null);
            void remote("forcePush");
          }}
          onRebase={() => void resolveSync("pullRebase")}
          onCancel={() => setSync(null)}
        />
      )}

      {auth && (
        <AuthDialog
          url={upstreamUrl(snap)}
          output={auth.output}
          repoPath={snap.path}
          busy={busy}
          onClose={() => setAuth(null)}
          onRetry={() => {
            const op = auth.op;
            setAuth(null);
            void remote(op);
          }}
        />
      )}
    </div>
  );
}
