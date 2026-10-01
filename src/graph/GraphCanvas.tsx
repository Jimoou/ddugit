import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import type { RefInfo } from "../types";
import type { Layout } from "./layout";
import { draw, type Drag, nodeRadius, plusPosition, toScreen, toWorld, type View } from "./renderer";
import { buildScene, COL, LANE, type Pt, xOf, yOf } from "./scene";
import { Minimap } from "./Minimap";

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
  /** Dropped `source` onto `target` — caller decides whether it's a valid merge. */
  onMerge(source: string, target: string): void;
  canMergeInto(target: string, source: string): boolean;
  onZoomChange?(k: number): void;
}

const MIN_K = 0.08;
const MAX_K = 3;
const clampK = (k: number) => Math.min(MAX_K, Math.max(MIN_K, k));

export const GraphCanvas = forwardRef<GraphHandle, Props>(function GraphCanvas(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const scene = useMemo(() => buildScene(props.layout), [props.layout]);

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

  // Mutable interaction state lives in a ref so pointer moves never re-render React.
  const st = useRef({
    view: { k: 1, tx: 0, ty: 0 } as View,
    target: null as View | null, // camera animation goal
    size: { w: 0, h: 0 },
    hovered: null as string | null,
    plusHover: false,
    drag: null as Drag | null,
    pan: null as { x: number; y: number; tx: number; ty: number; moved: boolean } | null,
    press: null as { id: string; x: number; y: number } | null,
    births: new Map<string, number>(),
    known: null as Set<string> | null,
    initialized: false,
  });
  const propsRef = useRef(props);
  propsRef.current = props;
  const sceneRef = useRef(scene);
  sceneRef.current = scene;
  const [cursor, setCursor] = useState("grab");
  const [dragHint, setDragHint] = useState<null | "idle" | "ok" | "bad">(null);
  const lastK = useRef(1);

  const now = () => performance.now() / 1000;

  // Sparkle burst for commits that appear after a refresh (new commit / merge).
  useEffect(() => {
    const s = st.current;
    const ids = new Set(props.layout.nodes.map((n) => n.id));
    if (s.known) {
      for (const id of ids) if (!s.known.has(id)) s.births.set(id, now());
    }
    s.known = ids;
  }, [props.layout]);

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
      const k = clampK(
        Math.min((w - 160) / Math.max(sc.width + COL, 1), (h - 160) / Math.max(sc.height + LANE, 1), 1.2),
      );
      st.current.target = viewFor({ x: (sc.width + COL) / 2, y: sc.height / 2 }, k);
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
      st.current.size = { w: r.width, h: r.height };
      if (!st.current.initialized && r.width > 0) {
        st.current.initialized = true;
        st.current.view = viewFor(headWorld(1), 1);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      });
      const hint = !s.drag ? null : s.drag.valid ? "ok" : s.drag.target ? "bad" : "idle";
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
      if (!id) continue;
      const node = sc.layout.byId.get(id)!;
      const sp = toScreen(s.view, { x: xOf(node.row, n), y: yOf(node.lane) });
      if (Math.hypot(sp.x - p.x, sp.y - p.y) <= r) return id;
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
    const id = nodeAt(p);
    if (id) {
      s.press = { id, x: p.x, y: p.y };
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
      s.drag = { from: s.press.id, to: p, target: null, valid: false };
    }
    if (s.drag) {
      const t = nodeAt(p);
      s.drag.to = p;
      s.drag.target = t && t !== s.drag.from ? t : null;
      s.drag.valid = !!s.drag.target && propsRef.current.canMergeInto(s.drag.target, s.drag.from);
      setCursor(s.drag.valid ? "copy" : s.drag.target ? "not-allowed" : "crosshair");
      return;
    }
    s.plusHover = onPlus(p);
    s.hovered = s.plusHover ? null : nodeAt(p);
    setCursor(s.plusHover || s.hovered ? "pointer" : "grab");
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const s = st.current;
    const p = local(e);
    if (s.drag) {
      if (s.drag.valid && s.drag.target) propsRef.current.onMerge(s.drag.from, s.drag.target);
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
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={() => {
            st.current.hovered = null;
            st.current.plusHover = false;
          }}
        />
      </div>
      {dragHint && (
        <div className={`drag-hint ${dragHint}`}>
          {dragHint === "ok"
            ? "놓으면 병합합니다"
            : dragHint === "bad"
              ? "브랜치 끝(체크포인트)에만 병합할 수 있어요"
              : "병합할 브랜치 끝으로 끌어다 놓으세요"}
        </div>
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
