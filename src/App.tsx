import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, DEMO_PATH, isTauri } from "./api";
import { Composer } from "./components/Composer";
import { Inspector } from "./components/Inspector";
import { MergeDialog } from "./components/MergeDialog";
import { Sidebar } from "./components/Sidebar";
import { GraphCanvas, type GraphHandle } from "./graph/GraphCanvas";
import { ancestors, computeLayout } from "./graph/layout";
import { NEON } from "./graph/scene";
import type { OpResult, RefInfo, RepoSnapshot } from "./types";
import "./App.css";

type Toast = { id: number; kind: "ok" | "err"; text: string };
type MergeReq = { sourceId: string; targetId: string; source: string; target: string };

const LAST_REPO = "otgit.lastRepo";
const ANIMATE = "otgit.animate";

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
  const [selected, setSelected] = useState<string | null>(null);
  const [focusRef, setFocusRef] = useState<RefInfo | null>(null);
  const [composer, setComposer] = useState(false);
  const [mergeReq, setMergeReq] = useState<MergeReq | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [zoom, setZoom] = useState(1);
  const [animate, setAnimate] = useState(() => {
    const saved = store(ANIMATE);
    if (saved !== null) return saved === "1";
    return !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  });
  const graph = useRef<GraphHandle>(null);
  const toastId = useRef(0);

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
    void refresh();
  }, [refresh]);

  // Pick up edits made in an editor when the user comes back to the window.
  useEffect(() => {
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  const layout = useMemo(() => (snap ? computeLayout(snap.commits, snap.refs, snap.head) : null), [snap]);
  const summaries = useMemo(() => new Map(snap?.commits.map((c) => [c.id, c.summary]) ?? []), [snap]);
  const commitById = useMemo(() => new Map(snap?.commits.map((c) => [c.id, c]) ?? []), [snap]);
  const focus = useMemo(
    () => (snap && focusRef ? ancestors(snap.commits, focusRef.target) : null),
    [snap, focusRef],
  );
  const colorOf = useCallback(
    (id: string) => NEON[layout?.byId.get(id)?.color ?? 0],
    [layout],
  );

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

  async function run(label: string, op: () => Promise<OpResult>, after?: () => void) {
    if (!path) return;
    setBusy(true);
    try {
      const r = await op();
      if (r.ok) {
        toast("ok", label);
        after?.();
      } else if (r.conflict) {
        toast("err", "충돌이 났어요. 파일을 고친 뒤 + 로 커밋하거나 병합을 취소하세요.");
      } else {
        toast("err", r.output || `${label} 실패`);
      }
    } catch (e) {
      toast("err", String(e));
    } finally {
      setBusy(false);
      await refresh();
    }
  }

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
  const mergeColors = mergeReq && {
    s: colorOf(mergeReq.sourceId),
    t: colorOf(mergeReq.targetId),
  };

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="wordmark small">
          otgit<span>옷깃</span>
        </h1>
        <button className="repo" onClick={openRepo} title={snap.path}>
          {snap.name} <span className="muted">▾</span>
        </button>
        <span className="branch-now" style={{ ["--c" as string]: colorOf(snap.head.target ?? "") }}>
          ◉ {snap.head.branch ?? (snap.head.target ? `detached @ ${snap.head.target.slice(0, 7)}` : "빈 저장소")}
        </span>
        {!isTauri && <span className="demo-pill">데모 모드</span>}
        <div className="spacer" />
        <button className="ghost" onClick={() => setComposer(true)} disabled={busy}>
          ＋ 커밋 {snap.changes.length > 0 && <span className="count">{snap.changes.length}</span>}
        </button>
        <button className="ghost" onClick={() => void refresh()} title="새로고침">
          ⟳
        </button>
        <button
          className={`ghost ${animate ? "on" : ""}`}
          title="반짝임 효과"
          onClick={() => {
            setAnimate(!animate);
            store(ANIMATE, animate ? "0" : "1");
          }}
        >
          ✦
        </button>
      </header>

      {snap.state !== "clean" && (
        <div className="banner">
          <span>
            {snap.state === "merge" ? "병합 진행 중" : `${snap.state} 진행 중`}
            {conflicts > 0 && ` — 충돌 파일 ${conflicts}개`}. 해결 후 ＋ 로 커밋하면 병합이 완료됩니다.
          </span>
          {snap.state === "merge" && (
            <button disabled={busy} onClick={() => run("병합을 취소했어요", () => api.mergeAbort(path))}>
              병합 취소
            </button>
          )}
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
        </section>

        {composer && (
          <Composer
            changes={snap.changes}
            branch={snap.head.branch}
            merging={snap.state === "merge"}
            busy={busy}
            onClose={() => setComposer(false)}
            onCommit={async (message, paths, newBranch) => {
              if (newBranch) {
                try {
                  const r = await api.createBranch(path, newBranch, null, true);
                  if (!r.ok) return toast("err", r.output);
                } catch (e) {
                  return toast("err", String(e));
                }
              }
              await run("체크포인트를 추가했어요", () => api.commit(path, message, paths), () => {
                setComposer(false);
                setTimeout(() => graph.current?.centerOnHead(), 60);
              });
            }}
          />
        )}

        {!composer && selectedCommit && (
          <Inspector
            commit={selectedCommit}
            refs={snap.refs.filter((r) => r.target === selectedCommit.id)}
            color={colorOf(selectedCommit.id)}
            isHead={selectedCommit.id === snap.head.target}
            busy={busy}
            onClose={() => setSelected(null)}
            onSelect={(id) => {
              setSelected(id);
              graph.current?.centerOn(id);
            }}
            onCheckout={(name) => run(`${name}(으)로 이동했어요`, () => api.checkout(path, name))}
            onCreateBranch={(name, at) => run(`${name} 브랜치를 만들었어요`, () => api.createBranch(path, name, at, true))}
          />
        )}
      </div>

      {mergeReq && mergeColors && (
        <MergeDialog
          source={mergeReq.source.length === 40 ? mergeReq.source.slice(0, 7) : mergeReq.source}
          target={mergeReq.target}
          sourceColor={mergeColors.s}
          targetColor={mergeColors.t}
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
