// Commit summaries written on a slant below each star, so they fit even at
// normal zoom: parallel slanted lines never overlap each other, and a caption
// stops just before it would run into a commit on a lane below. With the graph
// turned upright every commit has a screen row of its own, and its summary is
// written straight past the lanes in use on that row (`laneReach`).

import type { Layout } from "./layout";
import { COL, LANE } from "./scene";

/** Captions run down and to the right at this angle (radians). */
export const SLANT = (38 * Math.PI) / 180;
/** World px of clearance kept around a commit a caption passes. */
const CLEAR = 15;

/**
 * How long (world px) the caption of the commit at `row`/`lane` can be before it
 * would cross another commit or run into another caption, capped at `max`.
 * `dir` 1 runs down to the right (the default, under the lanes), -1 up to the
 * right (into the open sky above, for commits without labels). `gap` is the
 * caption line height in world px (it grows as the view zooms out). Rows grow
 * to the left (older), so moving right along the caption means smaller rows.
 * `flip`: the graph is turned half round, so on screen rows grow to the right
 * and lanes upwards.
 */
export function captionLength(
  grid: ReadonlyMap<string, string>,
  row: number,
  lane: number,
  laneCount: number,
  max: number,
  gap = 14,
  dir: 1 | -1 = 1,
  flip = false,
): number {
  const sin = Math.sin(SLANT),
    cos = Math.cos(SLANT);
  const lanes = flip ? -dir : dir,
    rows = flip ? -1 : 1;
  let len = max;
  for (let d = 1; lane + d * lanes >= 0 && lane + d * lanes < laneCount && (d * LANE) / sin < len + gap; d++) {
    const dy = d * LANE;
    // Commits on that lane whose star or caption ours could reach.
    const reach = Math.ceil((len + dy) / COL) + 1;
    // Going up, commits a little to the left count too: their captions come down across ours.
    for (let c = dir === -1 ? -3 : -1; c <= reach; c++) {
      if (!grid.has(`${row - c * rows}:${lane + d * lanes}`)) continue;
      const dx = c * COL;
      const along = dx * cos + dy * sin; // where that commit sits along our caption
      const off = Math.abs(dx * sin - dy * cos); // and how far from its line
      if (off < CLEAR)
        len = Math.min(len, along - CLEAR - LANE / 2); // we would cross the star itself
      else if (dir === -1)
        len = Math.min(len, along - gap); // its own caption comes down across ours
      else if (off < gap && along > 0) len = Math.min(len, along - gap); // its caption runs alongside ours
    }
  }
  return Math.max(0, len);
}

/**
 * The furthest lane in use at each row: commits and the lines passing through.
 * An upright caption starts past it so it crosses nothing.
 */
export function laneReach(layout: Layout): number[] {
  const reach = new Array<number>(layout.rowCount).fill(0);
  const mark = (row: number, lane: number) => {
    if (reach[row] < lane) reach[row] = lane;
  };
  for (const n of layout.nodes) mark(n.row, n.lane);
  for (const e of layout.edges) for (let row = e.childRow + 1; row < e.parentRow; row++) mark(row, e.via);
  return reach;
}
