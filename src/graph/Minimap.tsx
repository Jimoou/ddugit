import { useEffect, useRef } from "react";
import { type Bounds, turnBounds } from "./camera";
import { toWorld, turn, type Turn, upright, type View } from "./renderer";
import { COL, LANE, NEON, type Pt, type Scene, xOf, yOf } from "./scene";

interface Props {
  scene: Scene;
  /** Turned like the graph: a strip along the bottom, or down the right side when time runs down. */
  rotation: Turn;
  getView(): View;
  getSize(): { w: number; h: number };
  onJump(world: Pt): void;
}

/** Thickness of the strip. */
const H = 54;
const PAD = 8;

/** Whole-history overview strip with the current viewport; click or drag to jump. */
export function Minimap({ scene, rotation, getView, getSize, onJump }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);
  const tall = upright(rotation);

  const world: Bounds = {
    left: -COL,
    right: scene.width + COL,
    top: -LANE / 2,
    bottom: Math.max(scene.height + LANE / 2, LANE * 2.5),
  };

  /** World → strip and back, the strip being the turned world box stretched to fit. */
  const mapping = () => {
    const c = ref.current!;
    const w = c.clientWidth,
      h = c.clientHeight;
    const box = turnBounds(world, rotation);
    const sx = (w - PAD * 2) / Math.max(box.right - box.left, 1);
    const sy = (h - PAD * 2) / Math.max(box.bottom - box.top, 1);
    const to = (p: Pt): Pt => {
      const q = turn(p, rotation);
      return { x: PAD + (q.x - box.left) * sx, y: PAD + (q.y - box.top) * sy };
    };
    const from = (m: Pt): Pt => turn({ x: (m.x - PAD) / sx + box.left, y: (m.y - PAD) / sy + box.top }, 4 - rotation);
    return { w, h, to, from };
  };

  // Static layer: re-rendered only when the graph changes or the strip resizes.
  const renderCache = () => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, h, to } = mapping();
    const off = document.createElement("canvas");
    off.width = Math.round(w * dpr);
    off.height = Math.round(h * dpr);
    const ctx = off.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = scene.layout.rowCount;
    ctx.lineWidth = 1;
    for (const e of scene.edges) {
      const a = e.edge;
      const p = to({ x: xOf(a.parentRow, n), y: yOf(a.parentLane) });
      const q = to({ x: xOf(a.childRow, n), y: yOf(a.childLane) });
      ctx.strokeStyle = NEON[a.color] + "99";
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    for (const node of scene.layout.nodes) {
      const p = to({ x: xOf(node.row, n), y: yOf(node.lane) });
      ctx.fillStyle = NEON[node.color];
      ctx.fillRect(p.x - 1, p.y - 1, 2, 2);
    }
    cache.current = off;
  };

  useEffect(() => {
    const c = ref.current!;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(c.clientHeight * dpr);
      renderCache();
    };
    resize();
    const ro = new ResizeObserver(() => ref.current && resize()); // gone once unmounted (e.g. switching repositories)
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, rotation]);

  useEffect(() => {
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const c = ref.current;
      // Nothing to draw before layout or while the tab is hidden (0×0).
      if (!c || !cache.current || cache.current.width === 0 || c.width === 0) return;
      const ctx = c.getContext("2d")!;
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, c.width, c.height);
      ctx.drawImage(cache.current, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const { w, h, to } = mapping();
      const v = getView();
      const size = getSize();
      // The screen's corners, through the world, onto the strip.
      const a = to(toWorld(v, { x: 0, y: 0 })),
        b = to(toWorld(v, { x: size.w, y: size.h }));
      ctx.fillStyle = "rgba(180,171,242,0.08)";
      ctx.strokeStyle = "rgba(180,171,242,0.8)";
      ctx.lineWidth = 1;
      const rx = Math.max(1, Math.min(a.x, b.x)),
        ry = Math.max(1, Math.min(a.y, b.y));
      const rw = Math.max(4, Math.min(w - 1, Math.max(a.x, b.x)) - rx);
      const rh = Math.max(4, Math.min(h - 1, Math.max(a.y, b.y)) - ry);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, rotation]);

  const jump = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    onJump(mapping().from({ x: e.clientX - r.left, y: e.clientY - r.top }));
  };

  return (
    <canvas
      ref={ref}
      className={`minimap ${tall ? "tall" : ""}`}
      style={tall ? { width: H } : { height: H }}
      onPointerDown={(e) => {
        dragging.current = true;
        ref.current!.setPointerCapture(e.pointerId);
        jump(e);
      }}
      onPointerMove={(e) => dragging.current && jump(e)}
      onPointerUp={() => (dragging.current = false)}
    />
  );
}
