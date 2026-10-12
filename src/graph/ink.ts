// The branch map's look: its style (how lines, stops and labels are drawn) and, per theme, its
// colours: lanes, the fills and text around them, and what the glow-style effects blend with.
// - gauge (the default): an instrument panel. Thin curved lines, small dots, plain labels, muted
//   lanes over a printed star chart.
// - metro: a route map. Thick lines bending at 45°, stations, interchanges for merges, route badges.
// - space: the original night sky (neon on deep space); in the light theme a printed chart.
// The light inks are deep enough to read as text on paper and nothing adds light.

import type { Theme } from "../theme";
import { ALERT, NEON } from "./scene";
import type { Tone } from "./subject";

export type MapStyle = "gauge" | "metro" | "space";
export const MAP_STYLES: readonly MapStyle[] = ["gauge", "metro", "space"];

export interface Ink {
  style: MapStyle;
  /** A printed chart (light) rather than the night sky: the backdrop is drawn as paper. */
  paper: boolean;
  /** A colour per lane index (layout `color`). */
  lanes: readonly string[];
  /** Conflicts and pending operations. */
  alert: string;
  /** The backdrop with the space background off. */
  sky: string;
  /** Inside a hollow star, a folded run, a stash, the [+] node. */
  hole: string;
  /** Rings around HEAD, the selection and picked commits; the star a valid drag points at. */
  ring: string;
  /** Text and marks on a filled badge (HEAD's branch, the change count, the hovered [+]). */
  onFill: string;
  badge: string;
  pill: string;
  pillOn: string;
  text: string;
  textOn: string;
  scope: string;
  chip: Record<Tone, string>;
  prInk: string;
  pr: { success: string; failure: string; pending: string; none: string };
  trail: string;
  bisect: { good: string; bad: string; probe: string; culprit: string };
  /** How sparkles, drag cables and wells mix in: they add light on the night sky, not on paper. */
  blend: GlobalCompositeOperation;
  /** The overview's viewport box. */
  view: { fill: string; stroke: string };
}

/** Lane inks for paper: the neon hues, deep enough to read as text (≥ 4.5:1 on the light map). */
export const PAPER_LANES = [
  "#08728f", // trunk
  "#a82d93",
  "#33720c",
  "#8c5900",
  "#6c52cc",
  "#b52f51",
  "#0c7454",
  "#2a64d0",
];

export const INK: Record<Theme, Ink> = {
  dark: {
    style: "space",
    paper: false,
    lanes: NEON,
    alert: ALERT,
    sky: "#05040e",
    hole: "#0a0814",
    ring: "#ffffff",
    onFill: "#07060d",
    badge: "rgba(10,8,20,0.85)",
    pill: "rgba(10,8,22,0.8)",
    pillOn: "rgba(24,20,44,0.94)",
    text: "rgba(255,255,255,0.9)",
    textOn: "#ffffff",
    scope: "rgba(255,255,255,0.5)",
    chip: {
      feat: "#4fd1a5",
      fix: "#ff6b81",
      docs: "#6cb8ff",
      perf: "#ffb84d",
      refactor: "#c08cff",
      test: "#3ee0d0",
      chore: "#9aa1b5",
      merge: "#9aa3ff",
      revert: "#ff8f5a",
      wip: "#ffd479",
    },
    prInk: "#c9b8ff",
    pr: { success: "#4fd1a5", failure: "#ff4d6d", pending: "#ffb84d", none: "#c9b8ff" },
    trail: "#ffd479",
    bisect: { good: "#4fd1a5", bad: "#ff4d6d", probe: "#cfc6ff", culprit: "#ff4d6d" },
    blend: "lighter",
    view: { fill: "rgba(34,232,255,0.08)", stroke: "rgba(34,232,255,0.8)" },
  },
  light: {
    style: "space",
    paper: true,
    lanes: PAPER_LANES,
    alert: "#c23558",
    sky: "#efe9de",
    hole: "#fffcf6",
    ring: "#1b1814",
    onFill: "#ffffff",
    badge: "rgba(255,252,246,0.95)",
    pill: "rgba(255,252,246,0.92)",
    pillOn: "#ffffff",
    text: "#2b2a27",
    textOn: "#1c1c1a",
    scope: "rgba(28,28,26,0.5)",
    chip: {
      feat: "#1f8754",
      fix: "#c23558",
      docs: "#2d6cdf",
      perf: "#9a6200",
      refactor: "#7a4fc9",
      test: "#0e7e7a",
      chore: "#6b6f7b",
      merge: "#4b55c8",
      revert: "#b3521c",
      wip: "#8a6a00",
    },
    prInk: "#6c52cc",
    pr: { success: "#1f8754", failure: "#c23558", pending: "#9a6200", none: "#6c52cc" },
    trail: "#9a6200",
    bisect: { good: "#1f8754", bad: "#c23558", probe: "#6c52cc", culprit: "#c23558" },
    blend: "source-over",
    view: { fill: "rgba(28,28,26,0.06)", stroke: "rgba(28,28,26,0.55)" },
  },
};

/** Gauge lanes on graphite: quiet hues that still read as text (≥ 4.5:1 on the map). */
const GAUGE_LANES = ["#7aa2e3", "#d97c93", "#7db592", "#d9a456", "#a08fd8", "#e08a6e", "#6cb9b5", "#b9c46a"];
/** Route colours on graphite: brighter, as they are mostly filled lines and badges with dark text. */
const METRO_LANES = ["#5b8ef0", "#e0607f", "#3fae76", "#e0a23a", "#8b78e6", "#e8804e", "#2fb3c0", "#a6b83a"];
/** Lanes on paper for the gauge and the route map: deep enough for text and white badge text. */
const CHART_LANES = ["#2a5fc4", "#b8345a", "#18723f", "#8c5900", "#6247c2", "#a8441a", "#0b6f78", "#56700c"];

/** The gauge and route map on the dark theme: the app's graphite, no added light. */
const GRAPHITE: Omit<Ink, "style" | "lanes"> = {
  paper: false,
  alert: "#e5485f",
  sky: "#121417",
  hole: "#121417",
  ring: "#e6e8eb",
  onFill: "#121417",
  badge: "rgba(21,24,27,0.94)",
  pill: "rgba(21,24,27,0.92)",
  pillOn: "#1a1d21",
  text: "#c9cdd3",
  textOn: "#e6e8eb",
  scope: "#7d848d",
  chip: {
    feat: "#7db592",
    fix: "#d97c93",
    docs: "#7aa2e3",
    perf: "#d9a456",
    refactor: "#a08fd8",
    test: "#6cb9b5",
    chore: "#8b9199",
    merge: "#9aa3d8",
    revert: "#e08a6e",
    wip: "#d9c26a",
  },
  prInk: "#a08fd8",
  pr: { success: "#7db592", failure: "#d97c93", pending: "#d9a456", none: "#a3a9b1" },
  trail: "#d9c26a",
  bisect: { good: "#7db592", bad: "#d97c93", probe: "#a3a9b1", culprit: "#d97c93" },
  blend: "source-over",
  view: { fill: "rgba(230,232,235,0.06)", stroke: "rgba(230,232,235,0.5)" },
};

const LOOKS: Record<MapStyle, Record<Theme, Ink>> = {
  space: INK,
  gauge: {
    dark: { ...GRAPHITE, style: "gauge", lanes: GAUGE_LANES },
    light: { ...INK.light, style: "gauge", lanes: CHART_LANES },
  },
  metro: {
    dark: { ...GRAPHITE, style: "metro", lanes: METRO_LANES },
    light: { ...INK.light, style: "metro", lanes: CHART_LANES },
  },
};

/** The branch map's look for a style and theme. */
export const inkOf = (style: MapStyle, theme: Theme): Ink => LOOKS[style][theme];
