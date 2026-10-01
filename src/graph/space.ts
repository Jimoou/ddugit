// Galaxy backdrop for the graph canvas: a deep gradient, a few soft nebulae
// and three star layers that drift slower than the graph when panning
// (parallax). Star layers are rendered once into tiles, so a frame costs a
// handful of drawImage calls.

import type { View } from "./renderer";

const TILE = 512;

interface StarLayer {
  tile: HTMLCanvasElement;
  /** Fraction of the camera's pan the layer follows (far stars move least). */
  parallax: number;
}

/** Deterministic PRNG so the sky is the same every launch. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TINTS = ["#ffffff", "#d6ddff", "#ffeedd", "#e0d4ff"];

function starTile(seed: number, count: number, maxR: number, maxA: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = c.height = TILE;
  const g = c.getContext("2d")!;
  const rand = mulberry32(seed);
  for (let i = 0; i < count; i++) {
    g.globalAlpha = 0.25 + rand() * (maxA - 0.25);
    g.fillStyle = TINTS[Math.floor(rand() * TINTS.length)];
    g.beginPath();
    g.arc(rand() * TILE, rand() * TILE, 0.4 + rand() * maxR, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

let layers: StarLayer[] | null = null;
const starLayers = () =>
  (layers ??= [
    { tile: starTile(11, 140, 0.55, 0.45), parallax: 0.04 },
    { tile: starTile(23, 55, 0.85, 0.65), parallax: 0.1 },
    { tile: starTile(37, 16, 1.2, 0.85), parallax: 0.2 },
  ]);

/** Soft colour clouds: [x, y] as a fraction of the view, radius as a fraction of its larger side. */
const NEBULAE: [number, number, number, string][] = [
  [0.22, 0.28, 0.6, "rgba(104, 76, 232, 0.2)"],
  [0.82, 0.78, 0.5, "rgba(36, 128, 204, 0.14)"],
  [0.62, 0.18, 0.36, "rgba(206, 72, 184, 0.1)"],
];

/** A few brighter stars that slowly twinkle when animation is on. */
const TWINKLES = (() => {
  const rand = mulberry32(53);
  return Array.from({ length: 12 }, () => ({ x: rand(), y: rand(), phase: rand() * Math.PI * 2 }));
})();

const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Paint the sky in CSS pixels (the caller has set the device-pixel transform). */
export function drawSpace(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  view: View,
  time: number,
  animate: boolean,
) {
  const base = ctx.createLinearGradient(0, 0, 0, h);
  base.addColorStop(0, "#0a0822");
  base.addColorStop(1, "#03020b");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  const side = Math.max(w, h);
  for (const [fx, fy, fr, color] of NEBULAE) {
    const x = fx * w + view.tx * 0.02;
    const y = fy * h + view.ty * 0.02;
    const g = ctx.createRadialGradient(x, y, 0, x, y, fr * side);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  for (const { tile, parallax } of starLayers()) {
    const ox = mod(view.tx * parallax, TILE) - TILE;
    const oy = mod(view.ty * parallax, TILE) - TILE;
    for (let x = ox; x < w; x += TILE) for (let y = oy; y < h; y += TILE) ctx.drawImage(tile, x, y);
  }

  for (const s of TWINKLES) {
    const a = animate ? 0.35 + 0.35 * Math.sin(time * 1.3 + s.phase) : 0.5;
    const x = mod(s.x * w + view.tx * 0.12, w);
    const y = mod(s.y * h + view.ty * 0.12, h);
    const g = ctx.createRadialGradient(x, y, 0, x, y, 3.5);
    g.addColorStop(0, `rgba(255, 255, 255, ${a})`);
    g.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - 4, y - 4, 8, 8);
  }
}
