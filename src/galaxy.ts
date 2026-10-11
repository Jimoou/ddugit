// The galaxy dashboard's reading of each repository: which signals it gives
// off (stopped mid-merge, changes, commits to pull or push...) and how many
// worlds give off each. Pure, so it is unit-tested.

import type { RepoGlance } from "./types";

/** Most urgent first: the order chips are shown in and the tally is read in. */
const SIGNALS = ["missing", "stopped", "changes", "behind", "ahead", "stash"] as const;
type Signal = (typeof SIGNALS)[number];

interface Lit {
  signal: Signal;
  /** Count to show next to it (files, commits, stashes); 0 for none. */
  n: number;
}

/** The signals a repository gives off, most urgent first. A quiet one gives none. */
export function signals(g: RepoGlance): Lit[] {
  if (g.error) return [{ signal: "missing", n: 0 }];
  const lit: Lit[] = [];
  if (g.state !== "clean" || g.conflicts > 0) lit.push({ signal: "stopped", n: g.conflicts });
  if (g.changes > 0) lit.push({ signal: "changes", n: g.changes });
  if (g.behind > 0) lit.push({ signal: "behind", n: g.behind });
  if (g.ahead > 0) lit.push({ signal: "ahead", n: g.ahead });
  if (g.stashes > 0) lit.push({ signal: "stash", n: g.stashes });
  return lit;
}

/** How many repositories give off each signal (only the ones some do). */
export function tally(list: RepoGlance[]): Lit[] {
  const count = new Map<Signal, number>();
  for (const g of list) for (const { signal } of signals(g)) count.set(signal, (count.get(signal) ?? 0) + 1);
  return SIGNALS.filter((s) => count.has(s)).map((signal) => ({ signal, n: count.get(signal)! }));
}

/** Repositories a batch pull goes to: readable, on a branch with an upstream, not stopped mid-operation. */
export const pullable = (list: RepoGlance[]) =>
  list.filter((g) => !g.error && g.branch && g.upstream && g.state === "clean").map((g) => g.path);

/** Repositories a batch branch switch goes to: readable and not stopped mid-operation. */
export const switchable = (list: RepoGlance[]) =>
  list.filter((g) => !g.error && g.state === "clean").map((g) => g.path);

/** Repositories a "fetch all" goes to: readable ones with somewhere to fetch from. */
export const fetchable = (list: RepoGlance[]) => list.filter((g) => !g.error && g.remotes > 0).map((g) => g.path);

/** The one colour a repository's star takes: the most urgent thing about it, or quiet. */
export type Tone = "missing" | "stopped" | "changes" | "behind" | "clean" | "unread";

export function tone(g: RepoGlance | undefined): Tone {
  if (!g) return "unread";
  if (g.error) return "missing";
  if (g.state !== "clean" || g.conflicts > 0) return "stopped";
  if (g.changes > 0) return "changes";
  if (g.behind > 0) return "behind";
  return "clean";
}

/** The star chart's radius. Rings at a day, a week, a month and a year: nearer the middle is more recent. */
export const CHART_R = 300;
export const CHART_RINGS = [
  { r: CHART_R / 4, label: "day", hours: 24 },
  { r: CHART_R / 2, label: "week", hours: 7 * 24 },
  { r: (CHART_R * 3) / 4, label: "month", hours: 30 * 24 },
  { r: CHART_R, label: "year", hours: 365 * 24 },
] as const;
const HOUR = 3600;
/** Inside this nothing sits, so fresh stars don't pile up on the centre. */
const CORE = 30;

/** How far out a repository whose last commit is `hours` old sits: log steps between the rings, the year's ring at most. */
export function radiusOf(hours: number | null): number {
  if (hours === null) return CHART_R;
  const h = Math.max(0, hours);
  let [lo, r0] = [0, 0];
  for (const ring of CHART_RINGS) {
    if (h <= ring.hours) {
      const f = Math.log1p(h - lo) / Math.log1p(ring.hours - lo);
      return Math.max(CORE, r0 + (ring.r - r0) * f);
    }
    [lo, r0] = [ring.hours, ring.r];
  }
  return CHART_R;
}

export interface ChartStar {
  path: string;
  x: number;
  y: number;
  /** Dot radius: bigger for more recent work. */
  size: number;
}

export interface Constellation {
  /** The group's id; null for the ungrouped (drawn without lines or a name). */
  id: string | null;
  stars: ChartStar[];
  /** Where the group's name goes, just outside its stars. */
  label: { x: number; y: number; anchor: "start" | "middle" | "end" };
}

/** Degrees left empty between two groups' slices of the sky. */
const GAP = 14;
/** The least distance between two stars side by side in a slice. */
const APART = 30;

/**
 * Lays repositories out on the star chart: each group (in order, then the
 * ungrouped) takes a slice of the circle sized by how many it holds, starting
 * at the top and going clockwise; inside a slice the most recent come first.
 * The distance from the centre is the age of the last commit (`timeOf`, Unix
 * seconds; null for unknown).
 */
export function chart(
  bands: { id: string | null; paths: string[] }[],
  timeOf: (path: string) => number | null,
  now: number,
): Constellation[] {
  const used = bands.filter((b) => b.paths.length);
  const total = used.reduce((n, b) => n + b.paths.length, 0);
  const free = 360 - (used.length > 1 ? GAP * used.length : 0);
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  let start = 0;
  return used.map((b) => {
    const span = (free * b.paths.length) / total;
    const age = (p: string) => {
      const t = timeOf(p);
      return t === null ? null : (now - t) / HOUR;
    };
    const order = [...b.paths].sort((p, q) => (age(p) ?? Infinity) - (age(q) ?? Infinity));
    // Neighbours in a slice stay at least `APART` apart: near the centre a narrow slice pushes them out a little.
    const step = (span / order.length) * (Math.PI / 180);
    const least = order.length > 1 ? Math.min(CHART_R, APART / step) : 0;
    const stars = order.map((path, i) => {
      const a = rad(start + (span * (i + 0.5)) / order.length);
      const r = Math.max(least, radiusOf(age(path)));
      return { path, x: Math.cos(a) * r, y: Math.sin(a) * r, size: 3 + 5 * (1 - r / CHART_R) };
    });
    const mid = rad(start + span / 2);
    const out = Math.min(CHART_R + 18, Math.max(...stars.map((s) => Math.hypot(s.x, s.y))) + 34);
    const c = Math.cos(mid);
    start += span + (used.length > 1 ? GAP : 0);
    return {
      id: b.id,
      stars,
      label: { x: c * out, y: Math.sin(mid) * out, anchor: c > 0.3 ? "start" : c < -0.3 ? "end" : "middle" },
    };
  });
}

/** A box to keep names apart in: centre-less, `x`/`y` its top left. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Where a star's name goes: beside it on the outer side, the other side, without the line under it, or not at all (shown on hover). */
export type Placement = { side: "right" | "left"; sub: boolean } | null;

/**
 * Places every star's name without overlapping another name, a star or a
 * fixed mark (`taken`). In the order given (so put the important ones first):
 * the outward side with the line under it, then the other side, then each
 * side with the name alone; if nothing fits, the name waits for a hover.
 */
export function placeLabels(
  stars: { x: number; y: number; size: number; name: number; sub: number }[],
  taken: Box[],
  line = 16,
): Placement[] {
  const boxes = [...taken, ...stars.map((s) => ({ x: s.x - s.size, y: s.y - s.size, w: 2 * s.size, h: 2 * s.size }))];
  return stars.map((s) => {
    const sides: ("right" | "left")[] = s.x >= 0 ? ["right", "left"] : ["left", "right"];
    for (const sub of s.sub > 0 ? [true, false] : [false])
      for (const side of sides) {
        const w = Math.max(s.name, sub ? s.sub : 0);
        const gap = s.size + 8;
        const box = {
          x: side === "right" ? s.x + gap : s.x - gap - w,
          y: s.y - line / 2,
          w,
          h: sub ? 2 * line - 2 : line - 2,
        };
        if (boxes.some((b) => overlaps(b, box))) continue;
        boxes.push(box);
        return { side, sub };
      }
    return null;
  });
}

/** Rough width of `text` in the chart's units at `px` font size: wide for Hangul and CJK, narrow for Latin. */
export const textWidth = (text: string, px: number) =>
  [...text].reduce((w, ch) => w + (/[\u1100-\u11ff\u2e80-\uffef]/.test(ch) ? px * 0.92 : px * 0.5), 0);
