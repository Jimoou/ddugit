// Commit summaries written on a slant below each star, so they fit even at
// normal zoom: parallel slanted lines never overlap each other, and a caption
// stops just before it would run into a commit on a lane below.

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
 */
export function captionLength(
  grid: ReadonlyMap<string, string>,
  row: number,
  lane: number,
  laneCount: number,
  max: number,
  gap = 14,
  dir: 1 | -1 = 1,
): number {
  const sin = Math.sin(SLANT),
    cos = Math.cos(SLANT);
  let len = max;
  for (let d = 1; lane + d * dir >= 0 && lane + d * dir < laneCount && (d * LANE) / sin < len + gap; d++) {
    const dy = d * LANE;
    // Commits on that lane whose star or caption ours could reach.
    const reach = Math.ceil((len + dy) / COL) + 1;
    // Going up, commits a little to the left count too: their captions come down across ours.
    for (let c = dir === -1 ? -3 : -1; c <= reach; c++) {
      if (!grid.has(`${row - c}:${lane + d * dir}`)) continue;
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
