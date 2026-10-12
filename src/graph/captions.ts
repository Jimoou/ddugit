// Commit summaries as map labels. Every commit has a column of its own (one commit per row of the
// layout), so its summary sits centred under its star, on a backing panel, in two lines at most
// within that column: no leader lines, nothing to match up by eye. A summary that would cover a
// star, a badge or another summary tries one line, then the spot above its star (when it has no
// badges there), and is left out when none is free; zooming in frees more room. With the graph
// turned upright every commit has a screen row of its own, and its summary is written straight
// past the lanes in use on that row (`laneReach`).

import type { Layout } from "./layout";

/** A screen rectangle. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A summary laid out to one or two lines, measured (panel size, px). */
export interface CaptionShape {
  lines: string[];
  w: number;
  h: number;
}

export interface CaptionItem {
  id: string;
  /** Star centre, screen px. */
  x: number;
  y: number;
  /** Ways to set it, best first (two lines, then one). */
  shapes: CaptionShape[];
  /** May sit above the star (it has no badges there). */
  up: boolean;
}

export interface PlacedCaption extends Box {
  id: string;
  lines: string[];
  above: boolean;
}

/** An upright caption's height (a pill with its text centred), px. */
export const CAPTION_H = 21;
/** Room between a star and its summary, px. */
export const CAPTION_DROP = 7;
/** A line of summary text, and the panel's padding around the lines, px. */
export const CAPTION_LINE = 16;
export const CAPTION_PAD = { x: 6, y: 3 };

/** Panel height for `n` lines. */
export const captionHeight = (n: number) => n * CAPTION_LINE + 2 * CAPTION_PAD.y;

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
 * Place `items` (most important first) centred under (or over) their stars of radius `r`,
 * avoiding `obstacles` (stars, badges) and each other. Items with no free spot are left out.
 */
export function placeCaptions(items: CaptionItem[], obstacles: Box[], r: number): PlacedCaption[] {
  const taken = new Taken();
  for (const b of obstacles) taken.add(b);
  const out: PlacedCaption[] = [];
  for (const it of items) {
    let placed: PlacedCaption | null = null;
    for (const above of it.up ? [false, true] : [false]) {
      for (const shape of it.shapes) {
        const y = above ? it.y - r - CAPTION_DROP - shape.h : it.y + r + CAPTION_DROP;
        const box = { x: it.x - shape.w / 2, y, w: shape.w, h: shape.h };
        if (taken.hits(box)) continue;
        placed = { id: it.id, ...box, lines: shape.lines, above };
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
