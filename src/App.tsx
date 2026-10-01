import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, DEMO_PATH, isTauri } from "./api";
import { Composer } from "./components/Composer";
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
import type { FileDiff, OpResult, OpStatus, Progress, RefInfo, RefOp, RemoteOp, RepoSnapshot } from "./types";
import "./App.css";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type MergeReq = { sourceId: string; targetId: string; source: string; target: string };
type DiffSource = { kind: "commit"; id: string } | { kind: "worktree"; scope: "unstaged" | "staged" };
type DiffState = { source: DiffSource; title: string; files: FileDiff[] | null; error: string | null; path?: string };

/** Commits loaded per page; `?page=N` overrides it for demos and e2e. */
const HISTORY_PAGE = Number(new URLSearchParams(window.location.search).get("page")) || 3000;

const LAST_REPO = "otgit.lastRepo";
const ANIMATE = "otgit.animate";

const REMOTE_DONE: Record<RemoteOp, string> = {
  fetch: "원격 커밋을 가져왔어요",
  pull: "최신 상태로 받았어요",
  pullMerge: "병합해서 받았어요",
  pullRebase: "리베이스해서 받았어요",
  push: "원격에 올렸어요",
};

/** In-progress operations: banner name, how to finish, and whether "계속" applies. */
const IN_PROGRESS: Record<string, { name: string; hint: string; canContinue: boolean }> = {
  merge: { name: "병합", hint: "해결 후 ＋ 로 커밋하면 병합이 완료됩니다.", canContinue: false },
  rebase: { name: "리베이스", hint: "파일을 고친 뒤 '계속'을 누르면 리베이스를 이어갑니다.", canContinue: true },
  "cherry-pick": { name: "cherry-pick", hint: "파일을 고친 뒤 '계속'을 누르면 복사를 마칩니다.", canContinue: true },
  revert: { name: "되돌리기", hint: "파일을 고친 뒤 '계속'을 누르면 되돌리기를 마칩니다.", canContinue: true },
};

/** URL of the remote behind HEAD's upstream (else `origin`, else the first remote). */
function upstreamUrl(snap: RepoSnapshot): string | null {
  const name = snap.head.upstream?.split("/")[0];
  const r =
    snap.remotes.find((x) => x.name === name) ?? snap.remotes.find((x) => x.name === "origin") ?? snap.remotes[0];
  return r?.url ?? null;
}

function store(key: string, value?: string): string | null {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
  return null;
}

export default function App() {
  const [path, setPath] = useState<string | null>(() => (isTauri ? store(LAST_REPO) : DEMO_PATH));
  const [snap, setSnap] = useState<RepoSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState<RemoteOp | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedStash, setSelectedStash] = useState<number | null>(null);
  const [panelFiles, setPanelFiles] = useState<FileDiff[] | null>(null);
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
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [zoom, setZoom] = useState(1);
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const [search, setSearch] = useState<{ query: string; index: number } | null>(null);
  const [animate, setAnimate] = useState(() => {
    const saved = store(ANIMATE);
    if (saved !== null) return saved === "1";
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  });
  const graph = useRef<GraphHandle>(null);
  const toastId = useRef(0);
  const diffReq = useRef(0);

  const toast = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++toastId.current;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 7000 : 3200);
  }, []);

  useEffect(() => {
    void api.initialRepo().then((p) => p && setPath(p));
  }, []);

  const refresh = useCallback(async () => {
    if (!path) return;
    try {
      const s = await api.snapshot(path, limit);
      setSnap(s);
      setLoadError(null);
    } catch (e) {
      setLoadError(String(e));
    }
  }, [path, limit]);

  // New repository: start from a clean slate.
  useEffect(() => {
    setSnap(null);
    setSelected(null);
    setSelectedStash(null);
    setFocusRef(null);
    setDiff(null);
    setLimit(HISTORY_PAGE);
  }, [path]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Files and refs changed on disk (editor, terminal git) → refresh.
  useEffect(() => {
    if (!path) return;
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
  }, [path, refresh]);

  // Pick up edits made in an editor when the user comes back to the window.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

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
    setPanelFiles(null);
    if (!path || !panelId) return;
    let live = true;
    api
      .commitDiff(path, panelId)
      .then((f) => live && setPanelFiles(f))
      .catch(() => live && setPanelFiles([]));
    return () => {
      live = false;
    };
  }, [path, panelId]);

  const loadDiff = useCallback(
    (source: DiffSource, title: string, file?: string) => {
      if (!path) return;
      const req = ++diffReq.current;
      setDiff((d) => ({ source, title, files: d?.title === title ? d.files : null, error: null, path: file }));
      const load =
        source.kind === "commit" ? api.commitDiff(path, source.id) : api.worktreeDiff(path, null, source.scope);
      load.then(
        (files) => req === diffReq.current && setDiff((d) => d && { ...d, files }),
        (e) => req === diffReq.current && setDiff((d) => d && { ...d, files: [], error: String(e) }),
      );
    },
    [path],
  );

  // The working-tree diff follows the files on disk.
  useEffect(() => {
    if (diff?.source.kind === "worktree") loadDiff(diff.source, diff.title, diff.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  const layout = useMemo(() => (snap ? computeLayout(snap.commits, snap.refs, snap.head) : null), [snap]);
  const summaries = useMemo(() => new Map(snap?.commits.map((c) => [c.id, c.summary]) ?? []), [snap]);
  const commitById = useMemo(() => new Map(snap?.commits.map((c) => [c.id, c]) ?? []), [snap]);
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
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        setSearch((s) => s ?? { query: "", index: 0 });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
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
    (target: string, source: string) => {
      if (!snap || snap.state !== "clean" || !branchAt(target)) return false;
      return !isAncestor(source, target); // already contained otherwise
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snap, branchAt],
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
        toast("err", "충돌이 났어요. 아래 충돌 해결 화면에서 고르거나 취소하세요.");
        setConflictSheet({});
      } else if (r.status === "failed") toast("err", r.output || `${label} 실패`);
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
      const r = await run(REMOTE_DONE[op], () => api.remote(path!, op, setProgress));
      if (r.status === "auth") setAuth({ op, output: r.output });
      if (r.status === "diverged" || r.status === "rejected") setSync(r.status);
      // A rejected push says nothing about how far behind we are; fetch so the dialog can show it.
      if (r.status === "rejected") await api.remote(path!, "fetch").then(refresh, () => {});
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
      confirmLabel: "복사",
      body: (
        <>
          <p>
            <b>“{summary}”</b> 커밋의 변경을 <b>{target}</b>에 새 커밋으로 복사합니다. 원래 커밋 SHA가 메시지에
            기록돼요.
          </p>
          {snap?.head.branch !== target && <p className="note">먼저 {target}(으)로 체크아웃해요.</p>}
        </>
      ),
      onConfirm: () => {
        setConfirm(null);
        void run(
          `${target}에 복사했어요`,
          () => api.pick(path!, "cherryPick", id, target),
          () => setTimeout(() => graph.current?.centerOnHead(), 60),
        );
      },
    });
  };

  const refRun = (label: string, op: RefOp) => run(label, () => api.ref(path!, op));

  const checkoutRef = (r: RefInfo) =>
    r.kind === "remote"
      ? refRun(`${r.name}을(를) 로컬로 가져와 이동했어요`, { kind: "checkoutRemote", remoteRef: r.name })
      : run(`${r.name}(으)로 이동했어요`, () => api.checkout(path!, r.name));

  const askBranchAt = (at: string) =>
    setNameReq({
      title: `${at.slice(0, 7)}에서 새 브랜치`,
      placeholder: "feature/my-idea",
      confirmLabel: "만들고 이동",
      onSubmit: (name) => {
        setNameReq(null);
        void run(`${name} 브랜치를 만들었어요`, () => api.createBranch(path!, name, at, true));
      },
    });

  const askTagAt = (at: string) =>
    setNameReq({
      title: `${at.slice(0, 7)}에 태그`,
      placeholder: "v1.0.0",
      confirmLabel: "태그 만들기",
      messagePlaceholder: "설명 (비워 두면 가벼운 태그, 쓰면 주석 태그)",
      onSubmit: (name, message) => {
        setNameReq(null);
        void refRun(`${name} 태그를 만들었어요`, { kind: "createTag", name, at, message });
      },
    });

  /** Delete a local branch; if git says it's unmerged, ask again before forcing. */
  const deleteBranch = (name: string) =>
    setConfirm({
      title: "브랜치 삭제",
      danger: true,
      confirmLabel: "삭제",
      body: (
        <p>
          로컬 브랜치 <b>{name}</b>을(를) 지웁니다. 원격 브랜치는 그대로예요.
        </p>
      ),
      onConfirm: async () => {
        setConfirm(null);
        const r = await refRun(`${name} 브랜치를 지웠어요`, { kind: "deleteBranch", name, force: false });
        if (r.status !== "unmerged") return;
        setConfirm({
          title: "병합되지 않은 브랜치",
          danger: true,
          confirmLabel: "그래도 삭제",
          body: (
            <p>
              <b>{name}</b>에는 다른 브랜치에 병합되지 않은 커밋이 있어요. 지우면 그 커밋들은 그래프에서
              사라집니다(reflog로만 복구 가능).
            </p>
          ),
          onConfirm: () => {
            setConfirm(null);
            void refRun(`${name} 브랜치를 지웠어요`, { kind: "deleteBranch", name, force: true });
          },
        });
      },
    });

  /** Right-click menu for a ref badge (graph) or a sidebar row. */
  const refMenu = (r: RefInfo): MenuItem[] => {
    if (!snap || !path) return [];
    const isHead = r.kind === "local" && r.name === snap.head.branch;
    const canMerge = !!snap.head.branch && !isHead && r.kind !== "tag" && canDropOn(snap.head.target ?? "", r.target);
    const merge: MenuItem = {
      label: snap.head.branch ? `${snap.head.branch}에 병합` : "HEAD에 병합",
      disabled: !canMerge,
      onSelect: () =>
        setMergeReq({ sourceId: r.target, targetId: snap.head.target!, source: r.name, target: snap.head.branch! }),
    };
    if (r.kind === "tag")
      return [
        { label: "태그 위치로 이동", onSelect: () => graph.current?.centerOn(r.target) },
        "separator",
        {
          label: "태그 삭제",
          danger: true,
          onSelect: () =>
            setConfirm({
              title: "태그 삭제",
              danger: true,
              confirmLabel: "삭제",
              body: (
                <p>
                  로컬 태그 <b>{r.name}</b>을(를) 지웁니다.
                </p>
              ),
              onConfirm: () => {
                setConfirm(null);
                void refRun(`${r.name} 태그를 지웠어요`, { kind: "deleteTag", name: r.name });
              },
            }),
        },
      ];
    if (r.kind === "remote")
      return [
        { label: "로컬 브랜치로 체크아웃", hint: "추적", onSelect: () => void checkoutRef(r) },
        merge,
        "separator",
        { label: "여기서 새 브랜치…", onSelect: () => askBranchAt(r.target) },
      ];
    return [
      { label: "체크아웃", disabled: isHead, onSelect: () => void checkoutRef(r) },
      merge,
      "separator",
      {
        label: "이름 변경…",
        onSelect: () =>
          setNameReq({
            title: "브랜치 이름 변경",
            placeholder: "새 이름",
            confirmLabel: "변경",
            initial: r.name,
            onSubmit: (to) => {
              setNameReq(null);
              void refRun(`${to}(으)로 이름을 바꿨어요`, { kind: "renameBranch", from: r.name, to });
            },
          }),
      },
      { label: "여기에 태그…", onSelect: () => askTagAt(r.target) },
      "separator",
      { label: "브랜치 삭제…", danger: true, disabled: isHead, onSelect: () => deleteBranch(r.name) },
    ];
  };

  /** Right-click menu for a commit node; entries that don't apply are disabled, not hidden. */
  const nodeMenu = (id: string): MenuItem[] => {
    if (!snap || !path) return [];
    const head = snap.head.target;
    const isHead = id === head;
    const onHead = isAncestor(id, head);
    const clean = snap.state === "clean";
    const locals = snap.refs.filter((r) => r.kind === "local" && r.target === id && r.name !== snap.head.branch);
    const summary = commitById.get(id)?.summary ?? id.slice(0, 7);
    return [
      { label: "여기서 새 브랜치…", onSelect: () => askBranchAt(id) },
      { label: "여기에 태그…", onSelect: () => askTagAt(id) },
      ...locals.map((r) => ({
        label: `${r.name} 체크아웃`,
        onSelect: () => void run(`${r.name}(으)로 이동했어요`, () => api.checkout(path, r.name)),
      })),
      "separator" as const,
      {
        label: snap.head.branch ? `${snap.head.branch}에 cherry-pick` : "HEAD에 cherry-pick",
        hint: "⌥ 드래그",
        disabled: !clean || onHead || !snap.head.branch,
        onSelect: () => confirmPick(id, snap.head.branch!),
      },
      {
        label: "되돌리는 커밋 만들기 (revert)",
        disabled: !clean || !onHead,
        onSelect: () =>
          setConfirm({
            title: "revert",
            confirmLabel: "되돌리기",
            body: (
              <p>
                <b>“{summary}”</b>의 변경을 거꾸로 적용하는 새 커밋을 {snap.head.branch ?? "HEAD"}에 만듭니다. 이력은
                지워지지 않아요.
              </p>
            ),
            onConfirm: () => {
              setConfirm(null);
              void run("되돌리는 커밋을 만들었어요", () => api.pick(path, "revert", id, null));
            },
          }),
      },
      {
        label: "마지막 커밋 수정 (amend)",
        disabled: !isHead || !clean,
        onSelect: () => show({ composer: true, amend: true }),
      },
      "separator" as const,
      { label: "SHA 복사", hint: id.slice(0, 7), onSelect: () => void navigator.clipboard?.writeText(id) },
    ];
  };

  const openRepo = async () => {
    const p = await api.pickFolder();
    if (!p) return;
    if (p !== DEMO_PATH) store(LAST_REPO, p);
    setPath(p);
  };

  // --- empty / error states ---------------------------------------------------
  if (!path || (!snap && loadError)) {
    return (
      <div className="welcome">
        <h1 className="wordmark">
          otgit<span>옷깃</span>
        </h1>
        <p>그래프로 보고, 그래프로 다루는 Git.</p>
        {loadError && <p className="note warn">{loadError}</p>}
        <div className="row">
          <button className="primary" onClick={openRepo}>
            저장소 열기
          </button>
          <button onClick={() => setPath(DEMO_PATH)}>데모 둘러보기</button>
        </div>
      </div>
    );
  }
  if (!snap || !layout) return <div className="welcome loading">불러오는 중…</div>;

  const selectedCommit = selected ? commitById.get(selected) : undefined;
  const conflicts = snap.changes.filter((c) => c.conflicted).length;
  const headColor = colorOf(snap.head.target ?? "");

  return (
    <div className="app">
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
        onOpenRepo={openRepo}
        onCompose={() => show({ composer: true })}
        onRefresh={() => void refresh()}
        onRemote={(op) => void remote(op)}
        onToggleAnimate={() => {
          setAnimate(!animate);
          store(ANIMATE, animate ? "0" : "1");
        }}
      />

      {snap.state !== "clean" && (
        <div className="banner">
          <span>
            {IN_PROGRESS[snap.state]?.name ?? snap.state} 진행 중{conflicts > 0 && ` — 충돌 파일 ${conflicts}개`}.{" "}
            {IN_PROGRESS[snap.state]?.hint ?? ""}
          </span>
          <span className="row">
            {conflicts > 0 && <button onClick={() => setConflictSheet({})}>충돌 해결</button>}
            {IN_PROGRESS[snap.state]?.canContinue && (
              <button disabled={busy} onClick={() => run("이어서 마쳤어요", () => api.continueOp(path))}>
                계속
              </button>
            )}
            <button disabled={busy} onClick={() => run("취소했어요", () => api.abort(path))}>
              취소
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
                const target = branchAt(targetId)!;
                if (mode === "merge")
                  return setMergeReq({ sourceId, targetId, target, source: sourceName(sourceId, target) });
                confirmPick(sourceId, target);
              }}
              incoming={snap.incoming}
              truncated={snap.truncated}
              onLoadMore={() => setLimit((l) => l + HISTORY_PAGE)}
              onNodeMenu={(id, x, y) => setMenu({ x, y, title: commitById.get(id)?.summary, items: nodeMenu(id) })}
              onRefMenu={(r, x, y) => setMenu({ x, y, title: r.name, items: refMenu(r) })}
              onZoomChange={setZoom}
            />

            {snap.commits.length === 0 && (
              <div className="empty-hint">
                아직 체크포인트가 없어요. <b>＋</b> 를 눌러 첫 커밋을 만들어 보세요.
              </div>
            )}

            <div className="hud">
              <button onClick={() => graph.current?.zoomBy(0.8)} title="축소 (-)">
                −
              </button>
              <span className="zoom">{Math.round(zoom * 100)}%</span>
              <button onClick={() => graph.current?.zoomBy(1.25)} title="확대 (+)">
                ＋
              </button>
              <button onClick={() => graph.current?.fit()} title="전체 보기 (0)">
                ⤢
              </button>
              <button onClick={() => graph.current?.centerOnHead()} title="HEAD로 (H)">
                ◉
              </button>
            </div>
            <div className="hint">
              드래그 이동 · ⌘/Ctrl+휠 확대 · ⌘/Ctrl+F 검색 · 점을 끌어 다른 브랜치 끝에 놓으면 병합
              {snap.truncated && ` · 최근 ${snap.commits.length}개 표시 중`}
            </div>
            {/* Inside the graph area so bottom sheets never cover them. */}
            <div className="toasts">
              {toasts.map((t) => (
                <div key={t.id} className={`toast ${t.kind}`}>
                  {t.text}
                </div>
              ))}
            </div>
          </div>

          {conflictSheet && (
            <ConflictSheet
              path={path}
              files={snap.changes.filter((c) => c.conflicted).map((c) => c.path)}
              state={snap.state}
              initialFile={conflictSheet.file}
              busy={busy}
              onResolve={(file, how) => void run(`${file} 해결했어요`, () => api.resolve(path, file, how))}
              onClose={() => setConflictSheet(null)}
            />
          )}

          {diff && !conflictSheet && (
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
                            ? "스테이지에서 내렸어요"
                            : "스테이지했어요",
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
              loadDiff({ kind: "worktree", scope: c?.unstaged ? "unstaged" : "staged" }, "작업 중인 변경", file);
            }}
            onStash={(message, paths) =>
              run(
                "스태시에 보관했어요",
                () => api.stashPush(path, message, paths),
                () => {
                  show({});
                  setDiff((d) => (d?.source.kind === "worktree" ? null : d));
                },
              )
            }
            onDiscard={(paths) =>
              setConfirm({
                title: "변경 버리기",
                danger: true,
                confirmLabel: `${paths.length}개 파일 버리기`,
                body: (
                  <>
                    <p>
                      아래 파일의 변경을 마지막 커밋 상태로 되돌립니다. 새로 만든 파일은 <b>삭제</b>돼요.
                      <b> 되돌릴 수 없습니다.</b> 확실하지 않으면 스태시로 치워두세요.
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
                  void run("변경을 버렸어요", () => api.discard(path, paths));
                },
              })
            }
            onCommit={(message, paths, newBranch, amend, stagedOnly) =>
              run(
                amend ? "마지막 커밋을 수정했어요" : "체크포인트를 추가했어요",
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
            onCheckout={(name) => run(`${name}(으)로 이동했어요`, () => api.checkout(path, name))}
            onCreateBranch={(name, at) =>
              run(`${name} 브랜치를 만들었어요`, () => api.createBranch(path, name, at, true))
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
                "스태시를 꺼냈어요",
                () => api.stash(path, "pop", stashSel.index),
                () => show({}),
              )
            }
            onApply={() => run("스태시를 적용했어요", () => api.stash(path, "apply", stashSel.index))}
            onDrop={() =>
              setConfirm({
                title: "스태시 삭제",
                danger: true,
                confirmLabel: "삭제",
                body: <p>“{stashTitle(stashSel.message)}” 스태시를 지웁니다. 되돌릴 수 없어요.</p>,
                onConfirm: () => {
                  setConfirm(null);
                  void run(
                    "스태시를 삭제했어요",
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
            run(`${mergeReq.source} → ${mergeReq.target} 병합 완료`, () =>
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
