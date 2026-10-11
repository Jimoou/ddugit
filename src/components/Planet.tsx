import { useEffect, useRef } from "react";
import { INK } from "../graph/ink";
import { drawSpace } from "../graph/space";
import type { Theme } from "../theme";
import { planetLook } from "../planet";

/** Keep a canvas the size of its box (device pixels) and draw `paint` on it every frame. */
function useCanvasLoop(paint: (ctx: CanvasRenderingContext2D, w: number, h: number, time: number) => boolean | void) {
  const ref = useRef<HTMLCanvasElement>(null);
  const paintRef = useRef(paint);
  useEffect(() => {
    paintRef.current = paint;
  });
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext("2d")!;
    let raf = 0;
    const frame = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = c.clientWidth,
        h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (w > 0 && paintRef.current(ctx, w, h, performance.now() / 1000) === false) return;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);
  return ref;
}

/** The same sky as the branch map (night or printed), behind the home screen, drifting slowly (plain when `space` is off). */
export function SpaceBackdrop({ animate, space, theme }: { animate: boolean; space: boolean; theme: Theme }) {
  const t0 = useRef<number | null>(null);
  const ref = useCanvasLoop((ctx, w, h, time) => {
    if (!space) {
      ctx.fillStyle = INK[theme].sky;
      ctx.fillRect(0, 0, w, h);
      return;
    }
    t0.current ??= time;
    const drift = animate ? (time - t0.current) * 6 : 0;
    drawSpace(ctx, w, h, { k: 1, tx: -drift, ty: 0, r: 0 }, time, animate, INK[theme].paper);
  });
  return <canvas ref={ref} className="space-backdrop" aria-hidden />;
}

/** A repository's planet as a small glyph (tabs, recent list). */
export function PlanetDot({ path, big }: { path: string; big?: boolean }) {
  const look = planetLook(path);
  return (
    <span
      className={`planet-dot ${look.ring ? "ringed" : ""} ${big ? "big" : ""}`}
      style={{ ["--h" as string]: look.hue }}
      aria-hidden
    />
  );
}
