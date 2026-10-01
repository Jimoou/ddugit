import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, DEMO_PATH, isTauri } from "./api";
import { Composer } from "./components/Composer";
import { DiffSheet } from "./components/DiffSheet";
import { Inspector } from "./components/Inspector";
import { MergeDialog } from "./components/MergeDialog";
import { Sidebar } from "./components/Sidebar";
import { SyncDialog } from "./components/SyncDialog";
import { TopBar } from "./components/TopBar";
import { GraphCanvas, type GraphHandle } from "./graph/GraphCanvas";
import { ancestors, computeLayout } from "./graph/layout";
import { NEON } from "./graph/scene";
import type { FileDiff, OpResult, OpStatus, RefInfo, RemoteOp, RepoSnapshot } from "./types";
import "./App.css";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type MergeReq = { sourceId: string; targetId: string; source: string; target: string };
type DiffSource = { kind: "commit"; id: string } | { kind: "worktree" };
type DiffState = { source: DiffSource; title: string; files: FileDiff[] | null; error: string | null; path?: string };

const LAST_REPO = "otgit.lastRepo";
const ANIMATE = "otgit.animate";

const REMOTE_DONE: Record<RemoteOp, string> = {
  fetch: "원격 커밋을 가져왔어요",
  pull: "최신 상태로 받았어요",
  pullMerge: "병합해서 받았어요",
  pullRebase: "리베이스해서 받았어요",
  push: "원격에 올렸어요",
};

const CONFLICT_HINT: Record<string, string> = {
  merge: "해결 후 ＋ 로 커밋하면 병합이 완료됩니다.",
  rebase: "파일을 고친 뒤 '계속'을 누르면 리베이스를 이어갑니다.",
};

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
  const [commitFiles, setCommitFiles] = useState<FileDiff[] | null>(null);
  const [focusRef, setFocusRef] = useState<RefInfo | null>(null);
  const [composer, setComposer] = useState(false);
  const [mergeReq, setMergeReq] = useState<MergeReq | null>(null);
  const [sync, setSync] = useState<"diverged" | "rejected" | null>(null);
  const [diff, setDiff] = useState<DiffState | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [zoom, setZoom] = useState(1);
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
      const s = await api.snapshot(path);
      setSnap(s);
      setLoadError(null);
    } catch (e) {
      setLoadError(String(e));
    }
  }, [path]);

  useEffect(() => {
    setSnap(null);
    setSelected(null);
    setFocusRef(null);
    setDiff(null);
    void refresh();
  }, [refresh]);

  // Pick up edits made in an editor when the user comes back to the window.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  // Changed files of the selected commit, for the inspector.
  useEffect(() => {
    setCommitFiles(null);
    if (!path || !selected) return;
    let live = true;
    api
      .commitDiff(path, selected)
      .then((f) => live && setCommitFiles(f))
      .catch(() => live && setCommitFiles([]));
    return () => {
      live = false;
    };
  }, [path, selected]);

  const loadDiff = useCallback(
    (source: DiffSource, title: string, file?: string) => {
      if (!path) return;
      const req = ++diffReq.current;
      setDiff((d) => ({ source, title, files: d?.title === title ? d.files : null, error: null, path: file }));
      const load = source.kind === "commit" ? api.commitDiff(path, source.id) : api.worktreeDiff(path);
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
  const focus = useMemo(() => (snap && focusRef ? ancestors(snap.commits, focusRef.target) : null), [snap, focusRef]);
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
  useEffect(() => ancestorCache.current.clear(), [snap]);
  const canMergeInto = useCallback(
    (target: string, source: string) => {
      if (!snap || snap.state !== "clean" || !branchAt(target)) return false;
      let anc = ancestorCache.current.get(target);
      if (!anc) {
        anc = ancestors(snap.commits, target);
        ancestorCache.current.set(target, anc);
      }
      return !anc.has(source); // already merged otherwise
    },
    [snap, branchAt],
  );

  const sourceName = (id: string, target: string): string => {
    const refs = snap?.refs.filter((r) => r.target === id && r.kind !== "tag" && r.name !== target) ?? [];
    return (refs.find((r) => r.kind === "local") ?? refs[0])?.name ?? id;
  };

  /** Every git write goes through here: busy state, toasts, follow-up dialogs, refresh. */
  async function run(label: string, op: () => Promise<OpResult>, after?: () => void): Promise<OpStatus> {
    if (!path) return "failed";
    setBusy(true);
    let status: OpStatus = "failed";
    try {
      const r = await op();
      status = r.status;
      if (status === "ok") {
        toast("ok", label);
        after?.();
      } else if (status === "conflict") toast("err", "충돌이 났어요. 상단 안내에 따라 해결하거나 취소하세요.");
      else if (status === "diverged" || status === "rejected") setSync(status);
      else toast("err", r.output || `${label} 실패`);
    } catch (e) {
      toast("err", String(e));
    } finally {
      setBusy(false);
      await refresh();
    }
    return status;
  }

  const remote = async (op: RemoteOp): Promise<OpStatus> => {
    setRemoteBusy(op);
    try {
      const status = await run(REMOTE_DONE[op], () => api.remote(path!, op));
      // A rejected push says nothing about how far behind we are; fetch so the dialog can show it.
      if (status === "rejected") await api.remote(path!, "fetch").then(refresh, () => {});
      return status;
    } finally {
      setRemoteBusy(null);
    }
  };

  /** Resolve a diverged pull or rejected push with merge/rebase (then push for the latter). */
  const resolveSync = async (op: "pullMerge" | "pullRebase") => {
    const wasRejected = sync === "rejected";
    setSync(null);
    if ((await remote(op)) === "ok" && wasRejected) await remote("push");
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
        animate={animate}
        onOpenRepo={openRepo}
        onCompose={() => setComposer(true)}
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
            {snap.state === "merge" ? "병합" : snap.state === "rebase" ? "리베이스" : snap.state} 진행 중
            {conflicts > 0 && ` — 충돌 파일 ${conflicts}개`}. {CONFLICT_HINT[snap.state] ?? ""}
          </span>
          <span className="row">
            {snap.state === "rebase" && (
              <button disabled={busy} onClick={() => run("리베이스를 이어갔어요", () => api.continueRebase(path))}>
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
          onCheckout={(name) => run(`${name}(으)로 이동했어요`, () => api.checkout(path, name))}
        />

        <section className="stage">
          <div className="stage-graph">
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
              onSelect={(id) => {
                setSelected(id);
                if (id) setComposer(false);
              }}
              onPlus={() => {
                setSelected(null);
                setComposer(true);
              }}
              canMergeInto={canMergeInto}
              onMerge={(sourceId, targetId) => {
                const target = branchAt(targetId)!;
                setMergeReq({ sourceId, targetId, target, source: sourceName(sourceId, target) });
              }}
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
              드래그 이동 · ⌘/Ctrl+휠 확대 · 점을 끌어 다른 브랜치 끝에 놓으면 병합
              {snap.truncated && " · 최근 커밋만 표시 중"}
            </div>
          </div>

          {diff && (
            <DiffSheet
              title={diff.title}
              files={diff.files}
              error={diff.error}
              initialPath={diff.path}
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
            onClose={() => setComposer(false)}
            onOpenFile={(file) => loadDiff({ kind: "worktree" }, "작업 중인 변경", file)}
            onCommit={(message, paths, newBranch) =>
              run(
                "체크포인트를 추가했어요",
                async () => {
                  if (newBranch) {
                    const r = await api.createBranch(path, newBranch, null, true);
                    if (r.status !== "ok") return r;
                  }
                  return api.commit(path, message, paths);
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
            files={commitFiles}
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
      </div>

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

      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
