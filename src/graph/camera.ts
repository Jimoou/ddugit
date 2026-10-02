// Camera bounds: the graph is finite, so panning stops once the history would
// leave the screen instead of drifting into empty space forever.

import { turn, type Turn, type View } from "./renderer";

/** World-space box the graph occupies. */
export interface Bounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** How much of the graph stays on screen at the furthest pan, in pixels. */
export const KEEP = 160;

/** One axis: keep [lo, hi] (world) overlapping [0, size] (screen) by at least `keep` px. */
function clampAxis(t: number, k: number, lo: number, hi: number, size: number): number {
  const keep = Math.min(KEEP, size / 3);
  const min = keep - hi * k; // the far edge may not go past `keep` from the start
  const max = size - keep - lo * k; // the near edge may not go past `keep` from the end
  return Math.min(max, Math.max(min, t));
}

/** The box `b` turned `r` quarter turns: still axis-aligned, now in screen directions. */
export function turnBounds(b: Bounds, r: Turn): Bounds {
  const a = turn({ x: b.left, y: b.top }, r),
    c = turn({ x: b.right, y: b.bottom }, r);
  return { left: Math.min(a.x, c.x), right: Math.max(a.x, c.x), top: Math.min(a.y, c.y), bottom: Math.max(a.y, c.y) };
}

/** `view` moved the least amount needed to keep part of `b` (world) visible in a `w`×`h` viewport. */
export function clampView(view: View, world: Bounds, w: number, h: number): View {
  const b = turnBounds(world, view.r);
  const tx = clampAxis(view.tx, view.k, b.left, b.right, w);
  const ty = clampAxis(view.ty, view.k, b.top, b.bottom, h);
  return tx === view.tx && ty === view.ty ? view : { ...view, tx, ty };
}
