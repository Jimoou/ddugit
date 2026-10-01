import type { Layout, LayoutEdge } from "./layout";

/** World-space spacing at zoom 1. Time runs left → right (oldest on the left). */
export const COL = 84;
export const LANE = 46;

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

export interface EdgePath {
  edge: LayoutEdge;
  path: Path2D;
  /** Polyline samples (x0,y0,x1,y1,...) from parent (older) to child (newer). */
  samples: Float32Array;
  /** Cumulative length at each sample. */
  cum: Float32Array;
  length: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  seed: number;
}

export interface Scene {
  layout: Layout;
  edges: EdgePath[];
  /** `${row}:${lane}` → node id, for hit testing. */
  grid: Map<string, string>;
  width: number;
  height: number;
}

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

export function buildScene(layout: Layout): Scene {
  const n = layout.rowCount;
  const edges: EdgePath[] = layout.edges.map((e) => {
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
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < cum.length; i++) {
      const x = samples[i * 2], y = samples[i * 2 + 1];
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      if (i > 0) cum[i] = cum[i - 1] + Math.hypot(x - samples[i * 2 - 2], y - samples[i * 2 - 1]);
    }
    return {
      edge: e, path, samples, cum, length: cum[cum.length - 1] || 1,
      minX, maxX, minY, maxY, seed: hashStr(e.child + e.parent),
    };
  });

  const grid = new Map<string, string>();
  for (const node of layout.nodes) grid.set(`${node.row}:${node.lane}`, node.id);

  return {
    layout,
    edges,
    grid,
    width: Math.max(0, n - 1) * COL,
    height: Math.max(0, layout.laneCount - 1) * LANE,
  };
}

/** Point at distance fraction `t` (0 = parent end, 1 = child end) along an edge. */
export function pointAt(e: EdgePath, t: number): Pt {
  const d = t * e.length;
  const cum = e.cum;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid;
  }
  const span = cum[hi] - cum[lo] || 1;
  const f = Math.min(1, Math.max(0, (d - cum[lo]) / span));
  const s = e.samples;
  return {
    x: s[lo * 2] + (s[hi * 2] - s[lo * 2]) * f,
    y: s[lo * 2 + 1] + (s[hi * 2 + 1] - s[lo * 2 + 1]) * f,
  };
}
