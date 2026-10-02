import { useEffect, useMemo, useRef } from "react";
import { drawSpace } from "../graph/space";
import { drawPlanet, planetLook } from "../planet";

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

/** The same galaxy as the branch map, behind the new-tab screen, drifting slowly. */
export function SpaceBackdrop({ animate }: { animate: boolean }) {
  const t0 = useRef<number | null>(null);
  const ref = useCanvasLoop((ctx, w, h, time) => {
    t0.current ??= time;
    const drift = animate ? (time - t0.current) * 6 : 0;
    drawSpace(ctx, w, h, { k: 1, tx: -drift, ty: 0, r: 0 }, time, animate);
  });
  return <canvas ref={ref} className="space-backdrop" aria-hidden />;
}

/** A repository's planet as a small glyph (tabs, recent list). */
export function PlanetDot({ path }: { path: string }) {
  const look = planetLook(path);
  return (
    <span className={`planet-dot ${look.ring ? "ringed" : ""}`} style={{ ["--h" as string]: look.hue }} aria-hidden />
  );
}

/** The dust a planet forms from: angle, distance and size per grain, the same for the same seed. */
function dustCloud(seed: number) {
  let x = seed >>> 0 || 1;
  const rand = () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
  };
  return Array.from({ length: 140 }, () => ({ a: rand() * Math.PI * 2, d: 0.6 + rand() * 0.8, s: 0.6 + rand() }));
}

/** Seconds the birth takes. */
export const BIRTH_S = 1.9;

/**
 * A repository arriving (opened, cloned, created) is a planet being born at
 * the centre of the window: dust spirals in, collapses into a lit sphere with
 * a flash, and the new world fades as the graph takes the stage.
 */
export function PlanetBirth({ path, onDone }: { path: string; onDone(): void }) {
  const look = planetLook(path);
  const start = useRef<number | null>(null);
  const dust = useMemo(() => dustCloud(look.hue * 7919 + look.bands), [look.hue, look.bands]);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });
  const ref = useCanvasLoop((ctx, w, h, time) => {
    start.current ??= time;
    const t = (time - start.current) / BIRTH_S;
    ctx.clearRect(0, 0, w, h);
    if (t >= 1) {
      done.current();
      return false;
    }
    const cx = w / 2,
      cy = h / 2;
    const R = Math.min(w, h) * 0.09;
    // 0 – 0.55: dust spirals in; 0.4 – 0.6: collapse and flash; then the planet fades.
    const pull = Math.min(1, t / 0.55);
    const ease = 1 - Math.pow(1 - pull, 3);
    ctx.globalCompositeOperation = "lighter";
    for (const p of dust) {
      const d = R * 3.4 * p.d * (1 - ease) + R * 0.2;
      const a = p.a + ease * 5 * p.s;
      const x = cx + Math.cos(a) * d,
        y = cy + Math.sin(a) * d * 0.45;
      const alpha = (1 - Math.max(0, (t - 0.45) / 0.15)) * 0.8;
      if (alpha <= 0) continue;
      ctx.fillStyle = `hsla(${look.hue}, 90%, 75%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, 1.2 * p.s, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over";
    if (t > 0.4) {
      const grow = Math.min(1, (t - 0.4) / 0.2);
      const fade = t > 0.7 ? 1 - (t - 0.7) / 0.3 : 1;
      drawPlanet(ctx, cx, cy, R * (0.3 + 0.7 * grow), look, fade);
      // The flash of ignition.
      const f = Math.max(0, 1 - Math.abs(t - 0.55) / 0.12);
      if (f > 0) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 4);
        g.addColorStop(0, `rgba(255, 255, 255, ${0.7 * f})`);
        g.addColorStop(0.3, `hsla(${look.hue}, 90%, 70%, ${0.35 * f})`);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx - R * 4, cy - R * 4, R * 8, R * 8);
      }
    }
  });
  return <canvas ref={ref} className="planet-birth" aria-hidden />;
}
