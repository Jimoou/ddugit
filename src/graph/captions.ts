// Commit summaries as map labels: written straight (left to right), each
// hanging just under or over its star. Like place names on a map they are
// placed greedily by importance and a label that would cover a star, a badge
// or another label tries the next slot (a step further from the lane, or
// shorter) and is left out when none is free; zooming in frees more room, so
// more appear. With the graph turned upright every commit has a screen row of
// its own, and its summary is written straight past the lanes in use on that
// row (`laneReach`).

import type { Layout } from "./layout";

/** A screen rectangle. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CaptionItem {
  id: string;
  /** Star centre, screen px. */
  x: number;
  y: number;
  /** Width the whole summary wants. */
  w: number;
  /** May hang above the star (it has no badges there). */
  up: boolean;
}

interface PlacedCaption extends Box {
  id: string;
  /** Steps away from the star (0 = right under or over it): > 0 gets a leader line. */
  level: number;
  /** Hangs above the star. */
  above: boolean;
}

/** Caption height (a pill with its text centred), px. */
export const CAPTION_H = 18;
/** A label starts this far left of its star's centre, so it reads as starting at the star. */
const LEAD = 6;
/** A long label tries this much of itself before stepping further out. */
const SHORT_W = 120;

const hit = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Boxes bucketed by screen cell, so testing a slot looks at its neighbours only: zoomed out a
 * screen holds hundreds of stars, and testing each against every placed box was quadratic.
 */
class Taken {
  private cells = new Map<number, Box[]>();
  private static CELL = 64;
  private keys(b: Box, each: (key: number) => void) {
    const C = Taken.CELL;
    for (let cx = Math.floor(b.x / C); cx <= Math.floor((b.x + b.w) / C); cx++)
      for (let cy = Math.floor(b.y / C); cy <= Math.floor((b.y + b.h) / C); cy++) each(cx * 100_003 + cy);
  }
  add(b: Box) {
    this.keys(b, (key) => {
      const list = this.cells.get(key);
      if (list) list.push(b);
      else this.cells.set(key, [b]);
    });
  }
  hits(b: Box): boolean {
    let found = false;
    this.keys(b, (key) => {
      if (!found && this.cells.get(key)?.some((o) => hit(o, b))) found = true;
    });
    return found;
  }
}

/**
 * Place `items` (most important first) around their stars of radius `r`,
 * avoiding `obstacles` (stars, badges) and each other. Items that find no
 * free slot are left out.
 */
export function placeCaptions(items: CaptionItem[], obstacles: Box[], r: number): PlacedCaption[] {
  const taken = new Taken();
  for (const b of obstacles) taken.add(b);
  const out: PlacedCaption[] = [];
  for (const it of items) {
    const below = (level: number) => it.y + r + 5 + level * CAPTION_H;
    const above = (level: number) => it.y - r - 5 - (level + 1) * CAPTION_H;
    const slots: { y: number; level: number; above: boolean }[] = [
      { y: below(0), level: 0, above: false },
      ...(it.up ? [{ y: above(0), level: 0, above: true }] : []),
      { y: below(1), level: 1, above: false },
      ...(it.up ? [{ y: above(1), level: 1, above: true }] : []),
      { y: below(2), level: 2, above: false },
    ];
    const widths = it.w > SHORT_W ? [it.w, SHORT_W] : [it.w];
    let placed: PlacedCaption | null = null;
    for (const slot of slots) {
      for (const w of widths) {
        const box = { x: it.x - LEAD, y: slot.y, w, h: CAPTION_H };
        // A label further out gets a leader line from the star: keep that clear too.
        const top = slot.above ? slot.y + CAPTION_H : it.y + r + 3;
        const bottom = slot.above ? it.y - r - 3 : slot.y;
        const stem = slot.level ? { x: it.x - 1, y: top, w: 2, h: bottom - top } : null;
        if (taken.hits(box) || (stem !== null && taken.hits(stem))) continue;
        placed = { id: it.id, ...box, level: slot.level, above: slot.above };
        break;
      }
      if (placed) break;
    }
    if (placed) {
      taken.add(placed);
      out.push(placed);
    }
  }
  return out;
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
