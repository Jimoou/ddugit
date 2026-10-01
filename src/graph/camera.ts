// Camera bounds: the graph is finite, so panning stops once the history would
// leave the screen instead of drifting into empty space forever.

import type { View } from "./renderer";

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

/** `view` moved the least amount needed to keep part of `b` visible in a `w`×`h` viewport. */
export function clampView(view: View, b: Bounds, w: number, h: number): View {
  const tx = clampAxis(view.tx, view.k, b.left, b.right, w);
  const ty = clampAxis(view.ty, view.k, b.top, b.bottom, h);
  return tx === view.tx && ty === view.ty ? view : { ...view, tx, ty };
}
