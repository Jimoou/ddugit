import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { RefInfo, StashInfo } from "../types";
import type { Layout } from "./layout";
import {
  draw,
  type Drag,
  type DrawState,
  foldedRun,
  type LabelHit,
  nodeRadius,
  plusPosition,
  runRadius,
  stashMarks,
  stashRadius,
  toScreen,
  toWorld,
  type View,
  ZOOM,
} from "./renderer";
import { type Step, stepFrom } from "./navigate";
import { type Run, runIndex, straightRuns } from "./runs";
import { buildScene, COL, LANE, type Pt, xOf, yOf } from "./scene";
import { type Bounds, clampView } from "./camera";
import { Minimap } from "./Minimap";
import { t } from "../i18n";

export interface GraphHandle {
  centerOn(id: string, zoom?: number): void;
  centerOnHead(): void;
  fit(): void;
  zoomBy(f: number): void;
}

interface Props {
  layout: Layout;
  refs: RefInfo[];
  summaries: Map<string, string>;
  headId: string | null;
  headBranch: string | null;
  changeCount: number;
  selected: string | null;
  focus: Set<string> | null;
  animate: boolean;
  onSelect(id: string | null): void;
  onPlus(): void;
  stashes: StashInfo[];
  selectedStash: number | null;
  onStash(index: number | null): void;
  /** Dropped `source` onto `target` — caller decides whether it's a valid merge. */
  /** Dropped `source` onto branch tip `target`: merge, or cherry-pick with ⌥/Alt. */
  onDrop(source: string, target: string, mode: Drag["mode"]): void;
  canDropOn(target: string, source: string, mode: Drag["mode"]): boolean;
  onNodeMenu(id: string, x: number, y: number): void;
  incoming: string | null;
  truncated: boolean;
  onLoadMore(): void;
  onRefMenu(ref: RefInfo, x: number, y: number): void;
  onZoomChange?(k: number): void;
}

type DragHint = `${"merge" | "pick" | "move"}:${"idle" | "ok" | "bad"}`;

const ARROWS: Record<string, Step> = { ArrowLeft: "older", ArrowRight: "newer", ArrowUp: "up", ArrowDown: "down" };

const MIN_K = 0.08;
const MAX_K = 3;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

export const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scene = useMemo(() => buildScene(props.layout), [props.layout]);
  const marks = useMemo(() => stashMarks(scene, props.stashes), [scene, props.stashes]);
  const marksRef = useRef(marks);
  marksRef.current = marks;

  const refsByCommit = useMemo(() => {
    const m = new Map<string, RefInfo[]>();
    const order = { local: 0, remote: 1, tag: 2 } as const;
    for (const r of props.refs) {
      const list = m.get(r.target) ?? [];
      list.push(r);
      m.set(r.target, list);
    }
    for (const list of m.values()) list.sort((a, b) => order[a.kind] - order[b.kind]);
    return m;
  }, [props.refs]);

  // Commits that carry something to show (refs, HEAD, stashes, an incoming
  // merge) never fold into a run.
  const runs = useMemo(() => {
    const bases = new Set(props.stashes.map((x) => x.base));
    const keep = (id: string) => refsByCommit.has(id) || id === props.headId || id === props.incoming || bases.has(id);
    return straightRuns(scene.layout, keep);
  }, [scene, refsByCommit, props.headId, props.incoming, props.stashes]);
  const runOf = useMemo(() => runIndex(runs), [runs]);
  const runsRef = useRef({ runs, runOf });
  runsRef.current = { runs, runOf };

  const announced = props.selected
    ? [
        t("graph.commit", { sha: props.selected.slice(0, 7) }),
        props.summaries.get(props.selected),
        refsByCommit
          .get(props.selected)
          ?.map((r) => r.name)
          .join(", "),
        props.selected === props.headId ? "HEAD" : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  // Mutable interaction state lives in a ref so pointer moves never re-render React.
  const st = useRef({
    view: { k: 1, tx: 0, ty: 0 } as View,
    target: null as View | null, // camera animation goal
    size: { w: 0, h: 0 },
    hovered: null as string | null,
    plusHover: false,
    stashHover: null as number | null,
    runHover: null as Run | null,
    labelHits: [] as LabelHit[],
    moreHit: { rect: null } as DrawState["moreHit"],
    drag: null as Drag | null,
    pan: null as { x: number; y: number; tx: number; ty: number; moved: boolean } | null,
    press: null as { id: string; x: number; y: number } | null,
    births: new Map<string, number>(),
    known: null as Set<string> | null,
    anchor: null as { id: string; x: number } | null,
    initialized: false,
  });
  const propsRef = useRef(props);
  propsRef.current = props;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [cursor, setCursor] = useState("grab");
  const [dragHint, setDragHint] = useState<DragHint | null>(null);
  const lastK = useRef(1);

  const now = () => performance.now() / 1000;

  // On every new layout: keep the previously newest commit where it was on
  // screen (older history appended on the left shifts world x), and sparkle
  // commits that are newer than it (new commit / merge), not loaded history.
  useEffect(() => {
    const s = st.current;
    const { nodes, rowCount, byId } = props.layout;
    const ids = new Set(nodes.map((n) => n.id));
    const anchor = s.anchor && byId.get(s.anchor.id);
    if (s.anchor && anchor) {
      const dx = xOf(anchor.row, rowCount) - s.anchor.x;
      s.view = { ...s.view, tx: s.view.tx - dx * s.view.k };
      if (s.target) s.target = { ...s.target, tx: s.target.tx - dx * s.target.k };
    }
    if (s.known) {
      for (const n of nodes) if (!s.known.has(n.id) && (!anchor || n.row < anchor.row)) s.births.set(n.id, now());
    }
    s.known = ids;
    s.anchor = nodes.length ? { id: nodes[0].id, x: xOf(0, rowCount) } : null;
  }, [props.layout]);

  /** World box of the graph: from the "load more" tail (if any) to the [+] node. */
  const graphBounds = (): Bounds => {
    const sc = sceneRef.current;
    return { left: propsRef.current.truncated ? -COL * 2.4 : 0, right: sc.width + COL, top: 0, bottom: sc.height };
  };

  const viewFor = (world: Pt, k: number): View => {
    const { w, h } = st.current.size;
    return { k, tx: w / 2 - world.x * k, ty: h / 2 - world.y * k };
  };

  /** Frame HEAD and the [+] node, biased right like a timeline's "now". */
  const headWorld = (k: number): Pt => {
    const sc = sceneRef.current;
    const node = propsRef.current.headId ? sc.layout.byId.get(propsRef.current.headId) : undefined;
    if (!node) return plusPosition(sc, null);
    return { x: xOf(node.row, sc.layout.rowCount) + COL * 0.5 - (st.current.size.w * 0.18) / k, y: sc.height / 2 };
  };

  /** A commit's position on the canvas, or null if it isn't loaded. */
  const screenOf = (id: string): Pt | null => {
    const sc = sceneRef.current;
    const node = sc.layout.byId.get(id);
    return node ? toScreen(st.current.view, { x: xOf(node.row, sc.layout.rowCount), y: yOf(node.lane) }) : null;
  };
  /** Pan (keeping the zoom) when a keyboard-selected commit is off screen. */
  const reveal = (id: string) => {
    const p = screenOf(id);
    const { w, h } = st.current.size;
    if (p && (p.x < 60 || p.x > w - 60 || p.y < 40 || p.y > h - 40)) api.centerOn(id, st.current.view.k);
  };

  const api: GraphHandle = {
    centerOn(id, zoom) {
      const sc = sceneRef.current;
      const node = sc.layout.byId.get(id);
      if (!node) return;
      const k = zoom ?? Math.max(st.current.view.k, 0.8);
      st.current.target = viewFor({ x: xOf(node.row, sc.layout.rowCount), y: yOf(node.lane) }, k);
    },
    centerOnHead() {
      const k = Math.max(st.current.view.k, 0.9);
      st.current.target = viewFor(headWorld(k), k);
    },
    fit() {
      const sc = sceneRef.current;
      const { w, h } = st.current.size;
      const { left, right } = graphBounds();
      const k = clampK(Math.min((w - 160) / Math.max(right - left, 1), (h - 160) / Math.max(sc.height + LANE, 1), 1.2));
      st.current.target = viewFor({ x: (left + right) / 2, y: sc.height / 2 }, k);
    },
    zoomBy(f) {
      const { w, h } = st.current.size;
      zoomAt({ x: w / 2, y: h / 2 }, f, true);
    },
  };
  useImperativeHandle(ref, () => api);

  // Dev-only hook so e2e scripts can find nodes on screen.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__otgit = {
      screenOf(id: string): Pt | null {
        const sc = sceneRef.current;
        const node = sc.layout.byId.get(id);
        if (!node) return null;
        const r = canvasRef.current!.getBoundingClientRect();
        const p = toScreen(st.current.view, { x: xOf(node.row, sc.layout.rowCount), y: yOf(node.lane) });
        return { x: p.x + r.left, y: p.y + r.top };
      },
    };
  });

  function zoomAt(p: Pt, f: number, animated = false) {
    const s = st.current;
    const base = s.target ?? s.view;
    const k = clampK(base.k * f);
    const world = toWorld(base, p);
    const next = { k, tx: p.x - world.x * k, ty: p.y - world.y * k };
    if (animated) s.target = next;
    else {
      s.view = next;
      s.target = null;
    }
  }

  // Resize + DPR handling.
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      const c = canvasRef.current!;
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      c.style.width = `${r.width}px`;
      c.style.height = `${r.height}px`;
      const s = st.current;
      if (s.initialized) {
        // Keep the same world point at the centre when panels open or close.
        const dx = (r.width - s.size.w) / 2,
          dy = (r.height - s.size.h) / 2;
        s.view = { ...s.view, tx: s.view.tx + dx, ty: s.view.ty + dy };
        if (s.target) s.target = { ...s.target, tx: s.target.tx + dx, ty: s.target.ty + dy };
      }
      s.size = { w: r.width, h: r.height };
      if (!s.initialized && r.width > 0) {
        s.initialized = true;
        s.view = viewFor(headWorld(1), 1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Render loop.
  useEffect(() => {
    let raf = 0;
    const ctx = canvasRef.current!.getContext("2d")!;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const s = st.current;
      const p = propsRef.current;
      if (s.size.w === 0) return;
      if (s.target) {
        const v = s.view,
          t = s.target;
        const a = 0.2;
        // Interpolate in log-zoom space so zooming feels even.
        const k = Math.exp(Math.log(v.k) + (Math.log(t.k) - Math.log(v.k)) * a);
        s.view = { k, tx: v.tx + (t.tx - v.tx) * a, ty: v.ty + (t.ty - v.ty) * a };
        if (Math.abs(t.k - k) < 0.001 && Math.abs(t.tx - s.view.tx) < 0.5 && Math.abs(t.ty - s.view.ty) < 0.5) {
          s.view = t;
          s.target = null;
        }
      }
      // The graph is finite: never let it leave the screen.
      const bounds = graphBounds();
      s.view = clampView(s.view, bounds, s.size.w, s.size.h);
      if (s.target) s.target = clampView(s.target, bounds, s.size.w, s.size.h);
      if (Math.abs(lastK.current - s.view.k) > 0.005) {
        lastK.current = s.view.k;
        p.onZoomChange?.(s.view.k);
      }
      for (const [id, t0] of s.births) if (now() - t0 > 1.2) s.births.delete(id);
      draw(ctx, {
        scene: sceneRef.current,
        view: s.view,
        w: s.size.w,
        h: s.size.h,
        dpr: window.devicePixelRatio || 1,
        time: now(),
        animate: p.animate,
        headId: p.headId,
        headBranch: p.headBranch,
        plus: plusPosition(sceneRef.current, p.headId),
        plusHover: s.plusHover,
        changeCount: p.changeCount,
        selected: p.selected,
        hovered: s.hovered,
        focus: p.focus,
        refs: refsByCommit,
        summaries: p.summaries,
        drag: s.drag,
        births: s.births,
        stashes: marksRef.current,
        stashHover: s.stashHover,
        stashSelected: p.selectedStash,
        labelHits: s.labelHits,
        incoming: p.incoming,
        truncated: p.truncated,
        moreHit: s.moreHit,
        runs: runsRef.current.runs,
        runOf: runsRef.current.runOf,
        runHover: s.runHover,
      });
      const hint = !s.drag ? null : (`${s.drag.mode}:${s.drag.valid ? "ok" : s.drag.target ? "bad" : "idle"}` as const);
      setDragHint((h) => (h === hint ? h : hint));
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [refsByCommit]);

  // --- hit testing ---------------------------------------------------------
  function nodeAt(p: Pt): string | null {
    const s = st.current;
    const sc = sceneRef.current;
    const w = toWorld(s.view, p);
    const n = sc.layout.rowCount;
    const row = Math.round(n - 1 - w.x / COL);
    const lane = Math.round(w.y / LANE);
    const r = nodeRadius(s.view.k) + 6;
    for (const dr of [0, -1, 1]) {
      const id = sc.grid.get(`${row + dr}:${lane}`);
      if (!id || foldedRun(foldState(), id)) continue;
      const node = sc.layout.byId.get(id)!;
      const sp = toScreen(s.view, { x: xOf(node.row, n), y: yOf(node.lane) });
      if (Math.hypot(sp.x - p.x, sp.y - p.y) <= r) return id;
    }
    return null;
  }
  const foldState = () => ({
    view: st.current.view,
    focus: propsRef.current.focus,
    selected: propsRef.current.selected,
    runOf: runsRef.current.runOf,
  });
  /** The folded run whose bar is under `p`. */
  function runAt(p: Pt): Run | null {
    const v = st.current.view;
    if (v.k >= ZOOM.fold) return null;
    const sc = sceneRef.current;
    const n = sc.layout.rowCount;
    const node = sc.layout.nodes[Math.round(n - 1 - toWorld(v, p).x / COL)];
    const run = node && foldedRun(foldState(), node.id);
    if (!run) return null;
    const y = toScreen(v, { x: 0, y: yOf(run.lane) }).y;
    return Math.abs(y - p.y) <= runRadius(v.k) + 4 ? run : null;
  }
  /** Zoom in far enough that the run unfolds, framing as much of it as fits. */
  function openRun(run: Run) {
    const sc = sceneRef.current;
    const n = sc.layout.rowCount;
    const [x0, x1] = [xOf(run.last, n), xOf(run.first, n)];
    const k = clampK(Math.max(ZOOM.fold * 1.3, Math.min(1, (st.current.size.w - 200) / Math.max(x1 - x0, 1))));
    st.current.target = viewFor({ x: (x0 + x1) / 2, y: yOf(run.lane) }, k);
  }
  function stashAt(p: Pt): number | null {
    const v = st.current.view;
    const r = stashRadius(v.k) + 5;
    for (const m of marksRef.current) {
      const sp = toScreen(v, m.pos);
      if (Math.abs(sp.x - p.x) + Math.abs(sp.y - p.y) <= r) return m.index;
    }
    return null;
  }
  function onPlus(p: Pt): boolean {
    const s = st.current;
    const sp = toScreen(s.view, plusPosition(sceneRef.current, propsRef.current.headId));
    return Math.hypot(sp.x - p.x, sp.y - p.y) <= Math.max(9, Math.min(15, 12 * s.view.k)) + 6;
  }
  const local = (e: { clientX: number; clientY: number }): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // --- pointer handlers ----------------------------------------------------
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const p = local(e);
    const s = st.current;
    canvasRef.current!.setPointerCapture(e.pointerId);
    s.target = null;
    if (onPlus(p)) {
      propsRef.current.onPlus();
      return;
    }
    const more = s.moreHit.rect;
    if (more && p.x >= more.x && p.x <= more.x + more.w && p.y >= more.y && p.y <= more.y + more.h) {
      propsRef.current.onLoadMore();
      return;
    }
    const stash = stashAt(p);
    if (stash !== null) {
      propsRef.current.onStash(stash === propsRef.current.selectedStash ? null : stash);
      return;
    }
    const id = nodeAt(p);
    if (id) {
      s.press = { id, x: p.x, y: p.y };
      return;
    }
    const run = runAt(p);
    if (run) {
      s.runHover = null;
      openRun(run);
      return;
    }
    s.pan = { x: p.x, y: p.y, tx: s.view.tx, ty: s.view.ty, moved: false };
    setCursor("grabbing");
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = local(e);
    const s = st.current;
    if (s.pan) {
      const dx = p.x - s.pan.x,
        dy = p.y - s.pan.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) s.pan.moved = true;
      s.view = { ...s.view, tx: s.pan.tx + dx, ty: s.pan.ty + dy };
      return;
    }
    if (s.press && !s.drag && Math.hypot(p.x - s.press.x, p.y - s.press.y) > 6) {
      s.drag = { from: s.press.id, to: p, target: null, valid: false, mode: "merge" };
    }
    if (s.drag) {
      const t = nodeAt(p);
      s.drag.to = p;
      s.drag.target = t && t !== s.drag.from ? t : null;
      s.drag.mode = e.shiftKey ? "move" : e.altKey ? "pick" : "merge";
      s.drag.valid = !!s.drag.target && propsRef.current.canDropOn(s.drag.target, s.drag.from, s.drag.mode);
      setCursor(s.drag.valid ? "copy" : s.drag.target ? "not-allowed" : "crosshair");
      return;
    }
    s.plusHover = onPlus(p);
    s.stashHover = s.plusHover ? null : stashAt(p);
    s.hovered = s.plusHover || s.stashHover !== null ? null : nodeAt(p);
    s.runHover = s.plusHover || s.hovered || s.stashHover !== null ? null : runAt(p);
    setCursor(s.plusHover || s.hovered || s.runHover || s.stashHover !== null ? "pointer" : "grab");
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = st.current;
    const p = local(e);
    if (s.drag) {
      if (s.drag.valid && s.drag.target) propsRef.current.onDrop(s.drag.from, s.drag.target, s.drag.mode);
      s.drag = null;
    } else if (s.press) {
      propsRef.current.onSelect(s.press.id === propsRef.current.selected ? null : s.press.id);
    } else if (s.pan && !s.pan.moved && !onPlus(p)) {
      propsRef.current.onSelect(null);
    }
    s.press = null;
    s.pan = null;
    setCursor("grab");
  };

  // Wheel needs passive: false to preventDefault page zoom on pinch.
  useEffect(() => {
    const c = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = st.current;
      s.target = null;
      const scale = e.deltaMode === 1 ? 16 : 1;
      if (e.ctrlKey || e.metaKey) {
        // Pinch on trackpads arrives as ctrl+wheel.
        zoomAt(local(e), Math.exp(-e.deltaY * scale * 0.0022));
      } else if (e.shiftKey) {
        s.view = { ...s.view, ty: s.view.ty - e.deltaY * scale };
      } else if (e.deltaX !== 0) {
        s.view = { ...s.view, tx: s.view.tx - e.deltaX * scale, ty: s.view.ty - e.deltaY * scale };
      } else {
        // Plain mouse wheel scrolls the timeline.
        s.view = { ...s.view, tx: s.view.tx + e.deltaY * scale };
      }
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "=" || e.key === "+") api.zoomBy(1.25);
      else if (e.key === "-") api.zoomBy(0.8);
      else if (e.key === "0") api.fit();
      else if (e.key === "h" || e.key === "H") api.centerOnHead();
      else if (e.key === "Escape") {
        st.current.drag = null;
        propsRef.current.onSelect(null);
      } else if (ARROWS[e.key] || e.key === "Enter" || e.key === "ContextMenu") {
        // Only when nothing else has focus: arrows must still scroll lists and sheets.
        if (e.target !== document.body && e.target !== canvasRef.current) return;
        const { selected, headId } = propsRef.current;
        if (ARROWS[e.key]) {
          e.preventDefault();
          // The first arrow picks HEAD; later ones move from the selection.
          const next = selected ? stepFrom(sceneRef.current.layout, selected, ARROWS[e.key]) : headId;
          if (next) {
            propsRef.current.onSelect(next);
            reveal(next);
          }
        } else if (selected) {
          e.preventDefault();
          const at = screenOf(selected);
          const r = canvasRef.current!.getBoundingClientRect();
          if (at) propsRef.current.onNodeMenu(selected, r.left + at.x + 12, r.top + at.y + 12);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div className="graph">
      <div className="graph-area" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          style={{ cursor }}
          tabIndex={0}
          role="application"
          aria-label={t("graph.aria")}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onContextMenu={(e) => {
            e.preventDefault();
            const p = local(e);
            // Badges sit above nodes, so they win.
            const hit = st.current.labelHits
              .filter((l) => p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h)
              .pop();
            if (hit) return propsRef.current.onRefMenu(hit.ref, e.clientX, e.clientY);
            const id = nodeAt(p);
            if (id) propsRef.current.onNodeMenu(id, e.clientX, e.clientY);
          }}
          onPointerLeave={() => {
            st.current.hovered = null;
            st.current.plusHover = false;
          }}
        />
      </div>
      {/* Read out what keyboard (or mouse) selection lands on. */}
      <div className="sr-only" aria-live="polite">
        {announced}
      </div>
      {dragHint && (
        <div className={`drag-hint ${dragHint.split(":")[1]} ${dragHint.split(":")[0]}`}>{t(`drag.${dragHint}`)}</div>
      )}
      <Minimap
        scene={scene}
        getView={() => st.current.view}
        getSize={() => st.current.size}
        onJump={(world) => {
          st.current.target = null;
          st.current.view = viewFor(world, st.current.view.k);
        }}
      />
    </div>
  );
});
