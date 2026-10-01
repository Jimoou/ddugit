import { useEffect, useRef } from "react";
import type { View } from "./renderer";
import { COL, LANE, NEON, type Pt, type Scene, xOf, yOf } from "./scene";

interface Props {
  scene: Scene;
  getView(): View;
  getSize(): { w: number; h: number };
  onJump(world: Pt): void;
}

const H = 54;
const PAD = 8;

/** Whole-history overview strip with the current viewport; click or drag to jump. */
export function Minimap({ scene, getView, getSize, onJump }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const cache = useRef<HTMLCanvasElement | null>(null);
  const dragging = useRef(false);

  const worldW = scene.width + COL * 2;
  const worldH = scene.height + LANE;

  const mapping = () => {
    const c = ref.current!;
    const w = c.clientWidth;
    const sx = (w - PAD * 2) / worldW;
    const sy = (H - PAD * 2) / Math.max(worldH, LANE * 3);
    return { w, sx, sy };
  };

  // Static layer: re-rendered only when the graph changes or the strip resizes.
  const renderCache = () => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const { w, sx, sy } = mapping();
    const off = document.createElement("canvas");
    off.width = Math.round(w * dpr);
    off.height = Math.round(H * dpr);
    const ctx = off.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = scene.layout.rowCount;
    const X = (x: number) => PAD + (x + COL) * sx;
    const Y = (y: number) => PAD + (y + LANE / 2) * sy;
    ctx.lineWidth = 1;
    for (const e of scene.edges) {
      const a = e.edge;
      ctx.strokeStyle = NEON[a.color] + "99";
      ctx.beginPath();
      ctx.moveTo(X(xOf(a.parentRow, n)), Y(yOf(a.parentLane)));
      ctx.lineTo(X(xOf(a.childRow, n)), Y(yOf(a.childLane)));
      ctx.stroke();
    }
    for (const node of scene.layout.nodes) {
      ctx.fillStyle = NEON[node.color];
      ctx.fillRect(X(xOf(node.row, n)) - 1, Y(yOf(node.lane)) - 1, 2, 2);
    }
    cache.current = off;
  };

  useEffect(() => {
    renderCache();
    const ro = new ResizeObserver(() => {
      const c = ref.current;
      if (!c) return; // unmounted (e.g. switching repositories)
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.round(c.clientWidth * dpr);
      c.height = Math.round(H * dpr);
      renderCache();
    });
    ro.observe(ref.current!);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

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
      const { sx, sy } = mapping();
      const v = getView();
      const size = getSize();
      const x0 = PAD + (-v.tx / v.k + COL) * sx;
      const x1 = PAD + ((size.w - v.tx) / v.k + COL) * sx;
      const y0 = PAD + (-v.ty / v.k + LANE / 2) * sy;
      const y1 = PAD + ((size.h - v.ty) / v.k + LANE / 2) * sy;
      ctx.fillStyle = "rgba(34,232,255,0.08)";
      ctx.strokeStyle = "rgba(34,232,255,0.8)";
      ctx.lineWidth = 1;
      const rx = Math.max(1, x0),
        ry = Math.max(1, y0);
      const rw = Math.max(4, Math.min(c.clientWidth - 1, x1) - rx);
      const rh = Math.max(4, Math.min(H - 1, y1) - ry);
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx + 0.5, ry + 0.5, rw, rh);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene]);

  const jump = (e: React.PointerEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const { sx, sy } = mapping();
    onJump({
      x: (e.clientX - r.left - PAD) / sx - COL,
      y: (e.clientY - r.top - PAD) / sy - LANE / 2,
    });
  };

  return (
    <canvas
      ref={ref}
      className="minimap"
      style={{ height: H }}
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
