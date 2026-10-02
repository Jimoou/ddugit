// Galaxy backdrop for the graph canvas: a deep gradient, a few soft nebulae
// and three star layers that drift slower than the graph when panning
// (parallax), a couple of far planets and a distant galaxy. The sky turns
// very slowly around the view's centre while animation is on, like a night
// sky, and now and then something passes: a meteor every so often at an
// irregular pace, a slow comet rarely. Star layers are rendered once into
// tiles, so a frame costs a handful of drawImage calls.

import type { View } from "./renderer";
import { drawPlanet, type PlanetLook } from "../planet";

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

/** Far objects: [x, y] as a fraction of the view, size as a fraction of its larger side (capped). */
const FAR_PLANETS: { fx: number; fy: number; size: number; max: number; look: PlanetLook; alpha: number }[] = [
  { fx: 0.87, fy: 0.16, size: 0.03, max: 36, look: { hue: 28, ring: true, bands: 3 }, alpha: 0.42 },
  { fx: 0.09, fy: 0.84, size: 0.01, max: 11, look: { hue: 205, ring: false, bands: 0 }, alpha: 0.5 },
];
const GALAXY = { fx: 0.64, fy: 0.74, size: 0.05, tilt: -0.5 };

/** A spiral galaxy far away: a tilted, softly glowing disc with a bright core. */
function drawGalaxy(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, angle: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(GALAXY.tilt);
  ctx.scale(1, 0.38);
  const disc = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  disc.addColorStop(0, "rgba(255, 236, 214, 0.5)");
  disc.addColorStop(0.18, "rgba(196, 170, 255, 0.22)");
  disc.addColorStop(1, "rgba(120, 100, 220, 0)");
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  // Two arms as trails of soft dust, thinning towards their ends.
  ctx.rotate(angle * 4);
  for (const k of [0, Math.PI]) {
    for (let a = 0.3; a < Math.PI * 1.3; a += 0.12) {
      const d = r * (0.12 + a * 0.36);
      const px = Math.cos(a + k) * d,
        py = Math.sin(a + k) * d;
      const pr = r * 0.16 * (1 - a / (Math.PI * 1.6));
      const g = ctx.createRadialGradient(px, py, 0, px, py, pr);
      g.addColorStop(0, `rgba(205, 192, 255, ${0.07 * (1 - a / (Math.PI * 1.5))})`);
      g.addColorStop(1, "rgba(205, 192, 255, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
  }
  ctx.restore();
}

/** Things passing through the sky now and then (screen px, seconds). */
interface Streak {
  x: number;
  y: number;
  vx: number;
  vy: number;
  born: number;
  life: number;
  /** Tail length, px. */
  tail: number;
  width: number;
  color: string;
}
const passing = { meteors: [] as Streak[], comet: null as Streak | null, nextMeteor: 0, nextComet: 0 };
/** Seconds until the next meteor: irregular, mostly 7–25 s, so they surprise rather than tick. */
const meteorGap = () => 7 + Math.random() * 18;
/** A comet is rare: two to four minutes apart. */
const cometGap = () => 120 + Math.random() * 120;

/** Advance and draw meteors and the comet; new ones only while animating. */
function drawPassing(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, animate: boolean) {
  if (!passing.nextMeteor) passing.nextMeteor = time + 4 + Math.random() * 8;
  if (!passing.nextComet) passing.nextComet = time + 40 + Math.random() * 80;
  if (animate && time >= passing.nextMeteor) {
    passing.nextMeteor = time + meteorGap();
    const left = Math.random() < 0.5;
    const a = ((20 + Math.random() * 30) * Math.PI) / 180;
    const speed = 700 + Math.random() * 500;
    passing.meteors.push({
      x: w * (0.15 + Math.random() * 0.7),
      y: h * Math.random() * 0.45,
      vx: (left ? -1 : 1) * Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      born: time,
      life: 0.5 + Math.random() * 0.4,
      tail: 90 + Math.random() * 120,
      width: 1.2 + Math.random(),
      color: "255, 255, 255",
    });
  }
  if (animate && !passing.comet && time >= passing.nextComet) {
    passing.nextComet = time + cometGap();
    const fromLeft = Math.random() < 0.5;
    const life = 22 + Math.random() * 10;
    const y0 = h * (0.1 + Math.random() * 0.3);
    passing.comet = {
      x: fromLeft ? -40 : w + 40,
      y: y0,
      vx: ((fromLeft ? 1 : -1) * (w + 80)) / life,
      vy: (h * (0.15 + Math.random() * 0.2)) / life,
      born: time,
      life,
      tail: 140,
      width: 2.2,
      color: "190, 225, 255",
    };
  }
  const draw = (m: Streak) => {
    const age = time - m.born;
    const t = age / m.life;
    if (t < 0 || t > 1) return false;
    const x = m.x + m.vx * age,
      y = m.y + m.vy * age;
    const sp = Math.hypot(m.vx, m.vy) || 1;
    const tx = x - (m.vx / sp) * m.tail,
      ty = y - (m.vy / sp) * m.tail;
    const fade = Math.sin(t * Math.PI);
    const g = ctx.createLinearGradient(x, y, tx, ty);
    g.addColorStop(0, `rgba(${m.color}, ${0.9 * fade})`);
    g.addColorStop(1, `rgba(${m.color}, 0)`);
    ctx.strokeStyle = g;
    ctx.lineWidth = m.width;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(tx, ty);
    ctx.stroke();
    const head = ctx.createRadialGradient(x, y, 0, x, y, m.width * 3);
    head.addColorStop(0, `rgba(255, 255, 255, ${fade})`);
    head.addColorStop(1, `rgba(${m.color}, 0)`);
    ctx.fillStyle = head;
    ctx.beginPath();
    ctx.arc(x, y, m.width * 3, 0, Math.PI * 2);
    ctx.fill();
    return true;
  };
  passing.meteors = passing.meteors.filter(draw);
  if (passing.comet && !draw(passing.comet)) passing.comet = null;
}

/** One full turn of the sky every 10 minutes: visible if you watch, never distracting. */
const SPIN = (Math.PI * 2) / 600;

/** Sky angle, advanced only while animating so pausing doesn't make it jump. */
const sky = { angle: 0, last: null as number | null };

/** Advance the sky's angle by the time since the last frame (seconds). */
export function skyAngle(time: number, animate: boolean): number {
  const dt = sky.last === null ? 0 : Math.min(time - sky.last, 0.25);
  sky.last = time;
  if (animate && dt > 0) sky.angle = (sky.angle + dt * SPIN) % (Math.PI * 2);
  return sky.angle;
}

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

  // Everything after the base gradient turns with the sky. Drawing over the
  // view's circumscribed square keeps the corners filled at any angle.
  const angle = skyAngle(time, animate);
  const pad = Math.ceil(Math.hypot(w, h) / 2 - Math.min(w, h) / 2);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(angle);
  ctx.translate(-w / 2, -h / 2);

  const side = Math.max(w, h);
  for (const [fx, fy, fr, color] of NEBULAE) {
    const x = fx * w + view.tx * 0.02;
    const y = fy * h + view.ty * 0.02;
    const g = ctx.createRadialGradient(x, y, 0, x, y, fr * side);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(-pad, -pad, w + 2 * pad, h + 2 * pad);
  }

  for (const { tile, parallax } of starLayers()) {
    const ox = mod(view.tx * parallax, TILE) - TILE - Math.ceil(pad / TILE) * TILE;
    const oy = mod(view.ty * parallax, TILE) - TILE - Math.ceil(pad / TILE) * TILE;
    for (let x = ox; x < w + pad; x += TILE) for (let y = oy; y < h + pad; y += TILE) ctx.drawImage(tile, x, y);
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

  // Far away: barely moving with the camera.
  const gx = mod(GALAXY.fx * w + view.tx * 0.015, w),
    gy = mod(GALAXY.fy * h + view.ty * 0.015, h);
  drawGalaxy(ctx, gx, gy, Math.min(64, GALAXY.size * side), angle);
  for (const p of FAR_PLANETS) {
    const r = Math.min(p.max, p.size * side);
    const x = mod(p.fx * w + view.tx * 0.02, w + 4 * r) - 2 * r;
    const y = mod(p.fy * h + view.ty * 0.02, h + 4 * r) - 2 * r;
    drawPlanet(ctx, x, y, r, p.look, p.alpha);
  }
  ctx.restore();

  drawPassing(ctx, w, h, time, animate);
}
