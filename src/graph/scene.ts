import type { Layout, LayoutEdge } from "./layout";

/** World-space spacing at zoom 1. Time runs left → right (oldest on the left). */
export const COL = 84;
export const LANE = 46;

/** Conflict / pending-operation colour (matches the CSS `--red` token). */
export const ALERT = "#ff4d6d";

export const NEON = [
  "#22e8ff", // trunk
  "#ff3df2",
  "#a6ff4d",
  "#ffb84d",
  "#9b7bff",
  "#ff5d8f",
  "#3dffc5",
  "#4f8cff",
];

export interface Pt {
  x: number;
  y: number;
}

/** An edge with its world bounding box; its drawn shape is made when first needed (`shapeOf`). */
export interface EdgePath {
  edge: LayoutEdge;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** The drawn shape of an edge. */
export interface EdgeShape {
  path: Path2D;
  /** Polyline samples (x0,y0,x1,y1,...) from parent (older) to child (newer). */
  samples: Float32Array;
  /** Cumulative length at each sample. */
  cum: Float32Array;
  length: number;
  /** 0..1, offsets the sparkles so edges don't pulse in step. */
  seed: number;
}

export interface Scene {
  layout: Layout;
  edges: EdgePath[];
  /** Edge indices per `BUCKET` rows the edge spans, for `edgesInRows`. */
  buckets: number[][];
  width: number;
  height: number;
}

/** Rows per bucket of the edge index. */
const BUCKET = 64;

export const xOf = (row: number, rowCount: number) => (rowCount - 1 - row) * COL;
export const yOf = (lane: number) => lane * LANE;

type Seg = [Pt, Pt, Pt, Pt]; // cubic bezier (lines are degenerate cubics)

function cubic(a: Pt, b: Pt): Seg {
  const mx = (a.x + b.x) / 2;
  return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
}
function line(a: Pt, b: Pt): Seg {
  return [a, a, b, b];
}

function bez(s: Seg, t: number): Pt {
  const u = 1 - t;
  const [p0, p1, p2, p3] = s;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

function edgeSegments(e: LayoutEdge, n: number): Seg[] {
  // Built from the parent (older, left) towards the child (newer, right),
  // which is the direction the sparkles flow.
  const P = { x: xOf(e.parentRow, n), y: yOf(e.parentLane) };
  const C = { x: xOf(e.childRow, n), y: yOf(e.childLane) };
  if (e.parentRow - e.childRow <= 1) return [cubic(P, C)];
  const pIn = { x: xOf(e.parentRow - 1, n), y: yOf(e.via) };
  const cIn = { x: xOf(e.childRow + 1, n), y: yOf(e.via) };
  const segs: Seg[] = [];
  segs.push(e.via === e.parentLane ? line(P, pIn) : cubic(P, pIn));
  if (e.parentRow - 1 > e.childRow + 1) segs.push(line(pIn, cIn));
  segs.push(e.via === e.childLane ? line(cIn, C) : cubic(cIn, C));
  return segs;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return ((h >>> 0) % 1000) / 1000;
}

/**
 * World geometry of a layout. Only bounding boxes and a row index are made up
 * front (100k edges build in a few ms); paths are made for the edges that
 * get drawn, the first time they are.
 */
export function buildScene(layout: Layout): Scene {
  const n = layout.rowCount;
  const buckets: number[][] = Array.from({ length: Math.ceil(n / BUCKET) }, () => []);
  const edges: EdgePath[] = layout.edges.map((e, i) => {
    for (let b = Math.floor(e.childRow / BUCKET); b <= Math.floor(e.parentRow / BUCKET); b++) buckets[b].push(i);
    // A curve between two lanes stays between them; a long edge also runs along `via`.
    const long = e.parentRow - e.childRow > 1;
    const lo = Math.min(e.parentLane, e.childLane, long ? e.via : e.childLane);
    const hi = Math.max(e.parentLane, e.childLane, long ? e.via : e.childLane);
    return { edge: e, minX: xOf(e.parentRow, n), maxX: xOf(e.childRow, n), minY: yOf(lo), maxY: yOf(hi) };
  });
  return {
    layout,
    edges,
    buckets,
    width: Math.max(0, n - 1) * COL,
    height: Math.max(0, layout.laneCount - 1) * LANE,
  };
}

/** Edges that cross rows `first..last` (inclusive), in layout order. */
export function edgesInRows(scene: Scene, first: number, last: number): EdgePath[] {
  const lo = Math.max(0, Math.floor(first / BUCKET));
  const hi = Math.min(scene.buckets.length - 1, Math.floor(last / BUCKET));
  const picked = new Set<number>();
  for (let b = lo; b <= hi; b++)
    for (const i of scene.buckets[b]) {
      const e = scene.edges[i].edge;
      if (e.parentRow >= first && e.childRow <= last) picked.add(i);
    }
  return [...picked].sort((a, b) => a - b).map((i) => scene.edges[i]);
}

/** The commit drawn at a row and lane, if any (a row holds one commit). */
export function nodeAtCell(layout: Layout, row: number, lane: number): string | undefined {
  const node = layout.nodes[row];
  return node && node.lane === lane ? node.id : undefined;
}

const shapes = new WeakMap<EdgePath, EdgeShape>();

/** The edge's path and samples, made once per scene. */
export function shapeOf(scene: Scene, e: EdgePath): EdgeShape {
  let shape = shapes.get(e);
  if (!shape) shapes.set(e, (shape = makeShape(e.edge, scene.layout.rowCount)));
  return shape;
}

function makeShape(e: LayoutEdge, n: number): EdgeShape {
  const segs = edgeSegments(e, n);
  const path = new Path2D();
  path.moveTo(segs[0][0].x, segs[0][0].y);
  const pts: number[] = [segs[0][0].x, segs[0][0].y];
  for (const s of segs) {
    const isLine = s[0] === s[1] && s[2] === s[3];
    if (isLine) {
      path.lineTo(s[3].x, s[3].y);
      pts.push(s[3].x, s[3].y);
    } else {
      path.bezierCurveTo(s[1].x, s[1].y, s[2].x, s[2].y, s[3].x, s[3].y);
      for (let i = 1; i <= 12; i++) {
        const p = bez(s, i / 12);
        pts.push(p.x, p.y);
      }
    }
  }
  const samples = new Float32Array(pts);
  const cum = new Float32Array(samples.length / 2);
  for (let i = 1; i < cum.length; i++)
    cum[i] = cum[i - 1] + Math.hypot(samples[i * 2] - samples[i * 2 - 2], samples[i * 2 + 1] - samples[i * 2 - 1]);
  return { path, samples, cum, length: cum[cum.length - 1] || 1, seed: hashStr(e.child + e.parent) };
}

/** Point at distance fraction `t` (0 = parent end, 1 = child end) along an edge. */
export function pointAt(e: EdgeShape, t: number): Pt {
  const d = t * e.length;
  const cum = e.cum;
  let lo = 0,
    hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const f = Math.min(1, Math.max(0, (d - cum[lo]) / span));
  const s = e.samples;
  return {
    x: s[lo * 2] + (s[hi * 2] - s[lo * 2]) * f,
    y: s[lo * 2 + 1] + (s[hi * 2 + 1] - s[lo * 2 + 1]) * f,
  };
}

/** Fraction of the edge's length (0 = parent end) where it reaches world `x`; x only grows along an edge. */
export function fractionAtX(e: EdgeShape, x: number): number {
  const s = e.samples;
  const last = s.length / 2 - 1;
  if (x <= s[0]) return 0;
  if (x >= s[last * 2]) return 1;
  let lo = 0,
    hi = last;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (s[mid * 2] <= x) lo = mid;
    else hi = mid;
  }
  const f = (x - s[lo * 2]) / (s[hi * 2] - s[lo * 2] || 1);
  return (e.cum[lo] + (e.cum[hi] - e.cum[lo]) * f) / e.length;
}

/**
 * Positions (fractions of an edge) of `count` evenly spaced sparkles shifted
 * by `phase`, only those between `from` and `to`: a long edge mostly off
 * screen costs only the sparkles that show.
 */
export function sparklesIn(count: number, phase: number, from: number, to: number): number[] {
  const base = ((phase % 1) + 1) % 1;
  const out: number[] = [];
  const first = Math.max(Math.ceil((from - base) * count), -count + 1);
  const last = Math.min(Math.floor((to - base) * count), count - 1);
  for (let j = first; j <= last; j++) out.push(base + j / count);
  return out;
}
