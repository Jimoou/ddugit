// The branch map's colours per theme: lanes, the fills and text around them, and what the
// glow-style effects blend with. Dark is the original night sky (neon on deep space); light is
// a printed chart, so every colour is a deeper ink of the same hue and nothing adds light.

import type { Theme } from "../theme";
import { ALERT, NEON } from "./scene";
import type { Tone } from "./subject";

export interface Ink {
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
