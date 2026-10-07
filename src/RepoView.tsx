import { Icon } from "./components/Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, DEMO_PATH } from "./api";
import { demoControls } from "./mock";
import { Composer } from "./components/Composer";
import { type Effect, FxLayer, Nebula, useFx } from "./components/Fx";
import { FORGE_NAME, PullSection, TokenDialog, prRefs, type TokenForge } from "./components/Pulls";
import { MissionPanel, useVoyage } from "./components/Missions";
import { PeekCard } from "./components/Peek";
import { type Confirm, ConfirmDialog } from "./components/ConfirmDialog";
import { ContextMenu } from "./components/ContextMenu";
import { Inspector } from "./components/Inspector";
import { SearchBar } from "./components/SearchBar";
import { Sidebar } from "./components/Sidebar";
import { WorktreeSection } from "./components/Worktrees";
import { SubmoduleSection } from "./components/Submodules";
import { LfsSection } from "./components/Lfs";
import { joinPath } from "./recent";
import { StashPanel } from "./components/StashPanel";
import { TopBar } from "./components/TopBar";
import { GraphCanvas, type GraphHandle } from "./graph/GraphCanvas";
import { ancestors, ancestorsOf, computeLayout, descendantsOf } from "./graph/layout";
import { NEON } from "./graph/scene";
import { stashTitle } from "./format";
import { planMove } from "./rebasePlan";
import { useLoaded } from "./components/useLoaded";
import type { Settings } from "./settings";
import { t } from "./i18n";
import { openLink } from "./share";
import { Rich } from "./i18n/Rich";
import type { Drag, Turn } from "./graph/renderer";
import type { Pt } from "./graph/scene";
import { StackSection } from "./components/Stacks";
import { proOpen, usePro } from "./pro";
import type { FileDiff, FileTouch, LfsOp, RefInfo, StackBranch, StackOp } from "./types";
import { askName, askNewBranch, askRebaseOnto, checkoutRef, confirmPick, showCommit } from "./repo/actions";
import {
  applyStash,
  branchFromStash,
  changeMenu,
  commitChanges,
  discardFiles,
  dropStash,
  popStash,
  saveStash,
  stageFiles,
  stashMenu,
} from "./repo/changes";
import { BisectBanner, CompareBanner, StateBanner, TrailBanner } from "./repo/Banners";
import { RepoDialogs } from "./repo/Dialogs";
import {
  branchesMenu,
  fileMenu,
  nodeMenu,
  openMenu,
  prMenu,
  refMenu,
  remoteMenu,
  showPr,
  submoduleMenu,
  submoduleRun,
  worktreeMenu,
} from "./repo/menus";
import { RepoSheets } from "./repo/Sheets";
import type { CompareSide, Dialog, Menu, Repo, Sheet, Toast } from "./repo/state";
import { repoOpenMenu } from "./repo/outside";
import { useBisect } from "./repo/useBisect";
import { useRemote } from "./repo/useRemote";
import { useRun } from "./repo/useRun";
import { useSheet } from "./repo/useSheet";
import { useSearch } from "./repo/useSearch";
import { useSnapshot } from "./repo/useSnapshot";

/** How long the pointer rests on a star before its preview card shows. */
const PEEK_DELAY_MS = 350;

/** Open pull requests are re-read this often while the tab is visible (and after remote work). */
const PR_REFRESH_MS = 5 * 60_000;

/** Longest wait for the camera to settle before an effect plays anyway. */
const SETTLE_MAX_MS = 1500;

interface RepoViewProps {
  path: string;
  /** The visible tab: only it listens to keys, watches files and draws. */
  active: boolean;
  settings: Settings;
  /** Commits per page (settings, or `?page=` in demos). */
  page: number;
  toast: Toast;
  /** Loaded for the first time (recent list). */
  onLoaded(path: string, name: string): void;
  /** Change settings shared by every tab (sparkles, rotation, sidebar layout). */
  onChangeSettings(patch: Partial<Settings>): void;
  /** Open the repository menu (recent, open, clone, new) under the tab. */
  onRepoMenu(): void;
  /** Open another repository folder (a worktree) in a tab. */
  onOpenPath(path: string): void;
}

const NO_STACKS: StackBranch[] = [];

/** One open repository: its graph, panels, sheets and every git action on it. */
export function RepoView({
  path,
  active,
  settings,
  page,
  toast,
  onLoaded,
  onChangeSettings,
  onRepoMenu,
  onOpenPath,
}: RepoViewProps) {
  if (import.meta.env.DEV && path === DEMO_PATH && demoControls.crashTab) throw new Error("Demo tab crashed");
  const { snap, loadError, latest, refresh, loadMore, loadTo } = useSnapshot(path, page, active, onLoaded, toast);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedStash, setSelectedStash] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  /** Branches picked in the sidebar: their history stays lit in the graph, the rest fades. */
  const [focusRefs, setFocusRefs] = useState<RefInfo[]>([]);
  const [composer, setComposer] = useState<false | { amend: boolean; message?: string }>(false);
  const [menu, setMenu] = useState<Menu | null>(null);
  // Where the last menu opened, for a follow-up menu in the same spot (picking a stack parent).
  const menuAt = useRef({ x: 0, y: 0 });
  useEffect(() => {
    if (menu) menuAt.current = { x: menu.x, y: menu.y };
  }, [menu]);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  /** Git LFS, read apart from the snapshot (it runs `git lfs`). */
  const [lfsTick, setLfsTick] = useState(0);
  const pro = proOpen(usePro());
  /** Preview card: the commit the pointer has rested on, where its star was then. */
  const [peek, setPeek] = useState<{ id: string; at: Pt; width: number } | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const stageGraph = useRef<HTMLDivElement>(null);
  /** Open pull requests on the forge remotes; `prTick` re-reads them. */
  const [prTick, setPrTick] = useState(0);
  const rereadPulls = useCallback(() => setPrTick((n) => n + 1), []);
  const [tokenFor, setTokenFor] = useState<TokenForge | null>(null);
  /** File history: the commits that touched one file, drawn as a constellation. */
  const [trail, setTrail] = useState<{ file: string; touches: FileTouch[] } | null>(null);
  const [compareBase, setCompareBase] = useState<CompareSide | null>(null);
  const [zoom, setZoom] = useState(1);
  const animate = settings.animate;
  const rotate = () => onChangeSettings({ rotation: ((settings.rotation + 1) % 4) as Turn });
  // First-run tutorial, played on the demo repository only.
  const tour = useVoyage(path === DEMO_PATH);
  const { mission } = tour;
  const foundCulprit = useCallback(() => mission("bisect"), [mission]);
  const { playing: fx, play } = useFx(animate);
  const graph = useRef<GraphHandle>(null);
  /**
   * Play an effect once the new snapshot is drawn and the camera has come to rest
   * (an operation may also center on HEAD): `make` is asked for the effect on each
   * animation frame, and it plays once three frames in a row give the same answer
   * (the camera moves every frame while it eases).
   */
  const playAfterDraw = (make: (at: (id: string | null | undefined) => Pt | null) => Effect | null) => {
    const at = (id: string | null | undefined) => (id ? (graph.current?.screenOf(id) ?? null) : null);
    let last = "";
    let still = 0;
    const started = performance.now();
    const tick = () => {
      const e = make(at);
      const key = JSON.stringify(e);
      still = key === last ? still + 1 : 0;
      last = key;
      if (still >= 2 || performance.now() - started > SETTLE_MAX_MS) {
        if (e) play(e);
        return;
      }
      requestAnimationFrame(tick);
    };
    // Let a camera move queued right after the operation (centering on HEAD) begin first.
    setTimeout(tick, 100);
  };

  const layout = useMemo(() => (snap ? computeLayout(snap.commits, snap.refs, snap.head) : null), [snap]);
  const summaries = useMemo(() => new Map(snap?.commits.map((c) => [c.id, c.summary]) ?? []), [snap]);
  const commitById = useMemo(() => new Map(snap?.commits.map((c) => [c.id, c]) ?? []), [snap]);

  const { sheet, setSheet, conflict, setConflict, loadDiff, rebase } = useSheet(path, snap, commitById, toast);
  const { busy, run, refuseBusy } = useRun({
    path,
    toast,
    refresh,
    latest,
    onConflict: () => setConflict({}),
    setConfirm,
  });
  const remote = useRemote({
    path,
    snap,
    latest,
    busy,
    run,
    refuseBusy,
    toast,
    settings,
    onChangeSettings,
    mission,
    playAfterDraw,
    onPulled: rereadPulls,
  });
  const bisect = useBisect(path, snap, graph, play, foundCulprit);

  const stashSel = selectedStash !== null ? snap?.stashes[selectedStash] : undefined;
  /** The right panel shows one thing: composer, a stash, or a commit. */
  const show: Repo["show"] = (what) => {
    setSelected(what.commit ?? null);
    if (what.commit) mission("inspect");
    setSelectedStash(what.stash ?? null);
    setComposer(what.composer ? { amend: what.amend ?? false, message: what.message } : false);
  };

  // Changed files of the selected commit or stash (a stash is a commit too), for the side panel.
  const panelId = stashSel?.id ?? selected;
  // Files loaded for another commit don't count: show "loading" until ours arrive.
  const panelFiles = useLoaded(panelId ? `${path}\n${panelId}` : null, () =>
    api.commitDiff(path, panelId!).catch((): FileDiff[] => []),
  ).data;

  // Pull requests: read when the tab shows, then every few minutes (forges rate-limit, so not per snapshot).
  // Offline or no forge: the graph just has no PR labels.
  const pulls = useLoaded(active ? `${path}\n${prTick}` : null, () => api.pullRequests(path)).last;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setPrTick((n) => n + 1), PR_REFRESH_MS);
    return () => clearInterval(timer);
  }, [active, prTick]);
  const graphRefs = useMemo(
    () => [...(snap?.refs ?? []), ...prRefs(pulls, (id) => commitById.has(id))],
    [snap, pulls, commitById],
  );
  const search = useSearch({ path, snap, latest, loadTo, show, graph, toast });
  const searchLit = search.highlight;

  const trailIds = useMemo(() => trail?.touches.map((x) => x.id), [trail]);
  const trailFocus = useMemo(() => (trailIds ? new Set(trailIds) : null), [trailIds]);
  // Search highlights its matches; otherwise a focused branch highlights its ancestry.
  const focus = useMemo(() => {
    if (searchLit) return searchLit;
    if (!snap || !focusRefs.length) return null;
    const lit = new Set<string>();
    for (const r of focusRefs) for (const id of ancestors(snap.commits, r.target)) lit.add(id);
    return lit;
  }, [snap, focusRefs, searchLit]);

  const openSearch = search.open;
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "f") {
        e.preventDefault();
        openSearch();
      } else if ((mod && e.key.toLowerCase() === "r") || e.key === "F5") {
        // Re-read the repository (the file watcher usually has already); never reload the window.
        e.preventDefault();
        void refresh();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, refresh, openSearch]);
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

  const isAncestor = useCallback(
    (anc: string, of: string | null) => !!snap && !!of && ancestorsOf(snap.commits, of).has(anc),
    [snap],
  );
  const canDropOn = useCallback(
    (target: string, source: string, mode: Drag["mode"]) => {
      if (!snap || snap.state !== "clean") return false;
      if (mode === "move") return !!snap.head.target && !!planMove(commitById, snap.head.target, source, target);
      // The current branch onto another branch (or remote branch) that neither contains nor is behind it.
      if (mode === "rebase")
        return (
          !!snap.head.branch &&
          source === snap.head.target &&
          snap.refs.some((r) => r.target === target && (r.kind === "local" || r.kind === "remote")) &&
          !isAncestor(target, source) &&
          !isAncestor(source, target)
        );
      if (!branchAt(target)) return false;
      return !isAncestor(source, target); // already contained otherwise
    },
    [snap, branchAt, commitById, isAncestor],
  );

  /** Local branches checked out in another worktree → that folder. */
  const elsewhere = useMemo(
    () =>
      Object.fromEntries(
        (snap?.worktrees ?? []).flatMap((w) => (!w.current && w.branch && !w.missing ? [[w.branch, w.path]] : [])),
      ) as Record<string, string>,
    [snap],
  );

  // Re-read LFS when the checkout moves (new files may be pointers) or after an LFS command.
  const lfsKey = `${path}\n${snap?.head.target ?? ""}\n${lfsTick}`;
  const lfs = useLoaded(active ? lfsKey : null, () => api.lfsStatus(path)).last;

  // Re-read stacks whenever a local branch moves (commits, amends, restacks, renames).
  const stackKey = (snap?.refs ?? [])
    .filter((r) => r.kind === "local")
    .map((r) => `${r.name}@${r.target}`)
    .join(" ");
  const [stackTick, setStackTick] = useState(0);
  const stacks =
    useLoaded(active ? `${path}\n${stackKey}\n${stackTick}` : null, () => api.stackList(path)).last ?? NO_STACKS;

  const stackRun = async (label: string, op: StackOp) => {
    await run(label, () => api.stackOp(path, op));
    setStackTick((n) => n + 1);
  };

  const lfsRun = async (label: string, op: LfsOp) => {
    const r = await run(label, () => api.lfs(path, op));
    if (r.status === "auth") toast("err", t("lfs.auth"));
    setLfsTick((n) => n + 1);
  };

  /** Open a web page (a pull request, a token page) in the browser. */
  const openUrl = (url: string) => openLink(url, path);
  const saveToken = (forge: TokenForge, token: string | null) =>
    api.setForgeToken(path, forge.host, token).then(
      () => {
        setTokenFor(null);
        toast("ok", token ? t("pr.token.saved", { forge: FORGE_NAME[forge.kind] }) : t("pr.token.forgotten"));
        rereadPulls();
      },
      (e) => toast("err", String(e)),
    );

  /** Open a sheet, or close it when it is the one open (the top bar's and sidebar's toggles). */
  const toggleSheet = (s: Sheet) => setSheet((open) => (open?.kind === s.kind ? null : s));

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

  const repo: Repo = {
    path,
    snap,
    latest: () => latest.current,
    busy,
    pro,
    commitById,
    pulls,
    stacks,
    bisect: bisect.bisect,
    bisectDraft: bisect.draft,
    compareBase,
    elsewhere,
    selected,
    colorOf,
    graph: () => graph.current,
    toast,
    run,
    refresh: () => void refresh(),
    external: { editor: settings.editor, diffTool: settings.diffTool, mergeTool: settings.mergeTool },
    stackRun,
    show,
    setMenu,
    menuAt: () => menuAt.current,
    setConfirm,
    setDialog,
    setSheet,
    setConflict,
    setBisectDraft: bisect.setDraft,
    setCompareBase,
    loadDiff,
    setTrail,
    play,
    playAfterDraw,
    mission,
    onOpenPath,
    openUrl,
    fetchOne: remote.fetchOne,
    remoteRef: remote.remoteRef,
    canDropOn,
    isAncestor,
  };

  /**
   * The backport sheet from the sidebar: into the current branch, from the
   * branch most likely to have fixes it lacks (the original project first).
   */
  const openBackport = () => {
    const { branch, upstream } = snap.head;
    const names = snap.refs
      .filter((r) => (r.kind === "local" || r.kind === "remote") && !r.name.endsWith("/HEAD"))
      .map((r) => r.name)
      .filter((n) => n !== branch && n !== upstream);
    const prefer = ["upstream/main", "upstream/master", "origin/main", "origin/master", "main", "master", "develop"];
    const source = prefer.find((n) => names.includes(n)) ?? names[0];
    if (!branch || !source) return toast("err", t("bp.needBranches"));
    setSheet({ kind: "backport", source, target: branch });
  };

  /** The branch a dropped commit came from, for the merge dialog (else its id). */
  const sourceName = (id: string, target: string): string => {
    const refs = snap.refs.filter((r) => r.target === id && r.kind !== "tag" && r.name !== target);
    return (refs.find((r) => r.kind === "local") ?? refs[0])?.name ?? id;
  };

  const selectedCommit = selected ? commitById.get(selected) : undefined;
  const conflicts = snap.changes.filter((c) => c.conflicted).length;
  const headColor = colorOf(snap.head.target ?? "");

  return (
    <div className="app" hidden={!active}>
      {/* Only the visible tab has a top bar, so window-level lookups find one. */}
      {active && (
        <TopBar
          onVoyage={path === DEMO_PATH && !tour.shown ? tour.reopen : undefined}
          head={snap.head}
          headColor={headColor}
          changeCount={snap.changes.length}
          busy={busy}
          remoteBusy={remote.remoteBusy}
          progress={remote.progress}
          onBranches={(x, y) => openMenu(repo, x, y, t("top.branches"), branchesMenu(repo))}
          onCompose={() => show({ composer: true })}
          onUndoHistory={() => toggleSheet({ kind: "reflog" })}
          onOpenMenu={(x, y) => openMenu(repo, x, y, t("open.repoMenu"), repoOpenMenu(repo))}
          onRemote={remote.onRemote}
        />
      )}

      <BisectBanner repo={repo} />
      {trail && <TrailBanner repo={repo} trail={trail} />}
      {compareBase && <CompareBanner repo={repo} base={compareBase} />}
      <StateBanner repo={repo} />

      <div className="main">
        <Sidebar
          collapsed={settings.sidebarCollapsed}
          closed={settings.closedSections}
          onLayout={onChangeSettings}
          active={active}
          refs={snap.refs}
          headBranch={snap.head.branch}
          colorOf={colorOf}
          focused={focusRefs.map((r) => `${r.kind}:${r.name}`)}
          onFocus={(r) => {
            const key = (x: RefInfo) => `${x.kind}:${x.name}`;
            const on = focusRefs.some((x) => key(x) === key(r));
            // Each click toggles one ref in or out of the picked set.
            const next = on ? focusRefs.filter((x) => key(x) !== key(r)) : [...focusRefs, r];
            setFocusRefs(next);
            if (next.some((x) => key(x) === key(r))) graph.current?.centerOn(r.target);
          }}
          onClearFocus={() => setFocusRefs([])}
          onCheckout={(r) => checkoutRef(repo, r)}
          onAddRemote={remote.askRemote}
          remotes={snap.remotes}
          onRemoteMenu={(name, x, y) => openMenu(repo, x, y, name, remoteMenu(repo, name))}
          onNewBranch={() => askNewBranch(repo)}
          onBackport={openBackport}
          onTransfer={() => setDialog({ kind: "transfer" })}
          onCleanup={() => toggleSheet({ kind: "cleanup" })}
          onRefMenu={(r, x, y) => openMenu(repo, x, y, r.name, refMenu(repo, r))}
          stashes={snap.stashes}
          selectedStash={selectedStash}
          onStash={(i) => {
            show({ stash: i });
            const base = snap.stashes[i]?.base;
            if (base) graph.current?.centerOn(base);
          }}
          onStashMenu={(st, x, y) => openMenu(repo, x, y, stashTitle(st.message), stashMenu(repo, st))}
          elsewhere={elsewhere}
          extra={
            <>
              <StackSection
                stacks={stacks}
                head={snap.head.branch}
                busy={busy}
                onRestack={(branch) => void stackRun(t("stack.restacked"), { kind: "restack", branch })}
                onShow={(name) => {
                  const tip = snap.refs.find((r) => r.kind === "local" && r.name === name)?.target;
                  if (tip) graph.current?.centerOn(tip);
                }}
                onMenu={(name, x, y) => {
                  const r = snap.refs.find((x) => x.kind === "local" && x.name === name);
                  if (r) openMenu(repo, x, y, name, refMenu(repo, r));
                }}
              />
              <PullSection
                report={pulls}
                onShow={(pr) => showPr(repo, pr)}
                onOpen={(pr) => openUrl(pr.url)}
                onMenu={(pr, x, y) => openMenu(repo, x, y, pr.title, prMenu(repo, pr))}
                onConnect={setTokenFor}
                onCreate={() => {
                  const from = snap.head.branch ?? snap.refs.find((x) => x.kind === "local")?.name;
                  if (from) setDialog({ kind: "pr", from });
                }}
              />
              <SubmoduleSection
                submodules={snap.submodules}
                busy={busy}
                onOpen={(m) => onOpenPath(joinPath(snap.path, m.path))}
                onUpdateAll={() => void submoduleRun(repo, t("sub.updated"), { kind: "update", path: null })}
                onMenu={(m, x, y) => openMenu(repo, x, y, m.path, submoduleMenu(repo, m))}
              />
              <LfsSection
                status={lfs}
                busy={busy}
                onTrack={() =>
                  askName(
                    repo,
                    {
                      title: t("lfs.track.title"),
                      placeholder: t("lfs.track.placeholder"),
                      confirmLabel: t("lfs.track.go"),
                    },
                    (pattern) => void lfsRun(t("lfs.tracked", { pattern }), { kind: "track", pattern }),
                  )
                }
                onUntrack={(pattern) => void lfsRun(t("lfs.untracked", { pattern }), { kind: "untrack", pattern })}
                onTurnOn={() => void lfsRun(t("lfs.turnedOn"), { kind: "install" })}
                onPull={() => void lfsRun(t("lfs.pulled"), { kind: "pull" })}
                onOpenUrl={openUrl}
              />
              <WorktreeSection
                worktrees={snap.worktrees}
                onOpen={(w) => onOpenPath(w.path)}
                onAdd={() => setDialog({ kind: "worktree" })}
                onMenu={(w, x, y) => openMenu(repo, x, y, w.path, worktreeMenu(repo, w))}
              />
            </>
          }
        />

        <section className="stage">
          <div className="stage-graph" ref={stageGraph}>
            {search.view && <SearchBar search={search.view} />}
            <FxLayer playing={fx} />
            {peek && commitById.has(peek.id) && peek.id !== selected && !menu && (
              <PeekCard
                path={path}
                commit={commitById.get(peek.id)!}
                refs={graphRefs.filter((r) => r.target === peek.id)}
                at={peek.at}
                width={peek.width}
              />
            )}
            <Nebula on={conflicts > 0} still={!animate} />
            {tour.shown && (
              <MissionPanel
                voyage={tour.voyage}
                just={tour.just}
                onDismiss={tour.dismiss}
                onRestart={tour.restart}
                onOpenRepo={onRepoMenu}
              />
            )}
            <GraphCanvas
              ref={graph}
              layout={layout}
              refs={graphRefs}
              summaries={summaries}
              headId={snap.head.target}
              headBranch={snap.head.branch}
              changeCount={snap.changes.length}
              selected={selected}
              focus={trailFocus ?? bisect.focus ?? focus}
              badges={bisect.badges}
              trail={trailIds}
              animate={animate}
              space={settings.space}
              glow={settings.glow}
              onSelect={(id) => (id || !composer ? show({ commit: id }) : undefined)}
              onPlus={() => show({ composer: true })}
              stashes={snap.stashes}
              selectedStash={selectedStash}
              onStash={(i) => show({ stash: i })}
              canDropOn={canDropOn}
              onDrop={(sourceId, targetId, mode) => {
                if (mode === "move") {
                  const plan = planMove(commitById, snap.head.target!, sourceId, targetId);
                  if (plan) setSheet({ kind: "rebase", from: plan.base, init: plan.steps });
                  return;
                }
                if (mode === "rebase") return askRebaseOnto(repo, sourceName(targetId, snap.head.branch!), targetId);
                const target = branchAt(targetId)!;
                if (mode === "merge")
                  return setDialog({ kind: "merge", sourceId, targetId, target, source: sourceName(sourceId, target) });
                confirmPick(repo, sourceId, target);
              }}
              incoming={snap.incoming}
              truncated={snap.truncated}
              onLoadMore={loadMore}
              onNodeMenu={(id, x, y) => openMenu(repo, x, y, commitById.get(id)?.summary, nodeMenu(repo, id))}
              onRefMenu={(r, x, y) => openMenu(repo, x, y, r.name, refMenu(repo, r))}
              onZoomChange={setZoom}
              rotation={settings.rotation}
              onRotate={rotate}
              onHover={(id) => {
                clearTimeout(peekTimer.current);
                setPeek(null);
                if (!id) return;
                peekTimer.current = setTimeout(() => {
                  const at = graph.current?.screenOf(id);
                  if (at) setPeek({ id, at, width: stageGraph.current?.clientWidth ?? 0 });
                }, PEEK_DELAY_MS);
              }}
            />

            {snap.commits.length === 0 && (
              <div className="empty-hint">
                <Rich k="app.empty" />
              </div>
            )}

            <div className="hud">
              <button onClick={() => graph.current?.zoomBy(0.8)} title={t("hud.zoomOut")} aria-label={t("hud.zoomOut")}>
                <Icon name="minus" />
              </button>
              <span className="zoom">{Math.round(zoom * 100)}%</span>
              <button onClick={() => graph.current?.zoomBy(1.25)} title={t("hud.zoomIn")} aria-label={t("hud.zoomIn")}>
                <Icon name="plus" />
              </button>
              <button onClick={() => graph.current?.fit()} title={t("hud.fit")} aria-label={t("hud.fit")}>
                <Icon name="fit" />
              </button>
              <button onClick={() => graph.current?.centerOnHead()} title={t("hud.head")} aria-label={t("hud.head")}>
                <Icon name="head" />
              </button>
              <button
                className="turn"
                onClick={rotate}
                title={t("hud.rotate", { deg: settings.rotation * 90 })}
                aria-label={t("hud.rotate", { deg: settings.rotation * 90 })}
              >
                <Icon name="rotate" />
                <span className="deg">{settings.rotation * 90}°</span>
              </button>
            </div>
            <div className="hint">
              {t("graph.hint")}
              {snap.truncated && t("graph.hint.truncated", { n: snap.commits.length })}
            </div>
          </div>

          <RepoSheets repo={repo} sheet={sheet} conflict={conflict} rebase={rebase} askRemote={remote.askRemote} />
        </section>

        {composer && (
          <Composer
            // A prefilled message (after a squash merge) starts a fresh panel.
            key={composer.message ?? ""}
            initialMessage={composer.message}
            path={path}
            profiles={settings.profiles}
            onProfiles={(profiles) => onChangeSettings({ profiles })}
            onIdentity={(label, op) => run(label, () => api.setIdentity(path, op))}
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
              if (c?.conflicted) return setConflict({ file });
              // Fully staged files have nothing in the "unstaged" view.
              loadDiff({ kind: "worktree", scope: c?.unstaged ? "unstaged" : "staged" }, t("diff.worktree"), file);
            }}
            onFileMenu={(c, x, y) => openMenu(repo, x, y, c.path, changeMenu(repo, c))}
            onStage={(paths, unstage) => void stageFiles(repo, paths, unstage)}
            onStash={(message, paths, options) => void saveStash(repo, message, paths, options)}
            onDiscard={(paths) => discardFiles(repo, paths)}
            onCommit={(message, paths, newBranch, amend, stagedOnly, options) =>
              commitChanges(repo, message, paths, newBranch, amend, stagedOnly, options)
            }
          />
        )}

        {!composer && selectedCommit && (
          <Inspector
            path={path}
            commit={selectedCommit}
            refs={graphRefs.filter((r) => r.target === selectedCommit.id)}
            containedIn={snap.refs.filter(
              (r) =>
                (r.kind === "local" || r.kind === "remote") &&
                descendantsOf(snap.commits, selectedCommit.id).has(r.target),
            )}
            files={panelFiles}
            color={colorOf(selectedCommit.id)}
            isHead={selectedCommit.id === snap.head.target}
            // The menu only closes over `repo`'s ref readers; nothing reads them while it is built.
            // eslint-disable-next-line react-hooks/refs
            actions={nodeMenu(repo, selectedCommit.id)}
            onMore={(x, y) => openMenu(repo, x, y, selectedCommit.summary, nodeMenu(repo, selectedCommit.id))}
            onClose={() => setSelected(null)}
            onSelect={(id) => {
              setSelected(id);
              graph.current?.centerOn(id);
            }}
            onOpenFile={(file) =>
              loadDiff({ kind: "commit", id: selectedCommit.id }, selectedCommit.summary || selectedCommit.id, file)
            }
            onFileMenu={(file, x, y) => openMenu(repo, x, y, file, fileMenu(repo, selectedCommit, file))}
          />
        )}
        {stashSel && !composer && (
          <StashPanel
            stash={stashSel}
            files={panelFiles}
            busy={busy}
            onClose={() => show({})}
            onSelectBase={() => showCommit(repo, stashSel.base)}
            onOpenFile={(file) => loadDiff({ kind: "commit", id: stashSel.id }, stashTitle(stashSel.message), file)}
            onPop={() => void popStash(repo, stashSel)}
            onApply={() => void applyStash(repo, stashSel)}
            onBranch={() => branchFromStash(repo, stashSel)}
            onDrop={() => dropStash(repo, stashSel)}
          />
        )}
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} title={menu.title} items={menu.items} onClose={() => setMenu(null)} />
      )}

      {remote.jobCard}
      <RepoDialogs
        repo={repo}
        dialog={dialog}
        pulls={{ retry: prTick, reread: rereadPulls, pushTo: remote.pushTo, connect: setTokenFor }}
      />
      {remote.dialogs(headColor)}
      {confirm && <ConfirmDialog confirm={confirm} busy={busy} onCancel={() => setConfirm(null)} />}

      {tokenFor && (
        <TokenDialog
          forge={tokenFor}
          busy={busy}
          onSave={(token) => void saveToken(tokenFor, token)}
          onOpenPage={openUrl}
          onCancel={() => setTokenFor(null)}
        />
      )}
    </div>
  );
}
