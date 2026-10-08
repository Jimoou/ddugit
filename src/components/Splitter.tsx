import { useRef } from "react";
import { clampWidth } from "../settings";

interface Props {
  /** The CSS variable on the parent that holds the pane's width (e.g. `--sidebar-w`). */
  variable: string;
  width: number;
  range: { min: number; initial: number; max: number };
  /** The pane is on this side of the handle: dragging away from it makes it wider. */
  pane: "left" | "right";
  label: string;
  onResize(width: number): void;
}

/** The graph keeps at least this much room when a side pane grows, px. */
const GRAPH_MIN = 320;
const STEP = 16;

/**
 * A handle on the edge between a side pane and the graph: drag to resize (live, through the
 * parent's CSS variable, so nothing re-renders while dragging), arrow keys to nudge, double-click
 * to reset. The width is saved when the drag ends.
 */
export function Splitter({ variable, width, range, pane, label, onResize }: Props) {
  const drag = useRef<{ x: number; w: number; max: number; now: number } | null>(null);
  const dir = pane === "left" ? 1 : -1;

  /** The widest the pane may get without squeezing the graph below `GRAPH_MIN`. */
  const maxFrom = (el: HTMLElement, w: number) => {
    const stage = el.parentElement?.querySelector<HTMLElement>(".stage");
    const spare = stage ? stage.clientWidth - GRAPH_MIN : range.max;
    return Math.max(range.min, Math.min(range.max, w + spare));
  };
  const show = (el: HTMLElement, w: number) => el.parentElement?.style.setProperty(variable, `${w}px`);
  const set = (el: HTMLElement, w: number) => {
    const next = clampWidth(w, { min: range.min, max: maxFrom(el, width) });
    show(el, next);
    if (next !== width) onResize(next);
  };

  return (
    <div
      className="splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={width}
      tabIndex={0}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const el = e.currentTarget;
        el.setPointerCapture(e.pointerId);
        el.classList.add("dragging");
        drag.current = { x: e.clientX, w: width, max: maxFrom(el, width), now: width };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        d.now = clampWidth(d.w + dir * (e.clientX - d.x), { min: range.min, max: d.max });
        show(e.currentTarget, d.now);
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        e.currentTarget.classList.remove("dragging");
        if (d && d.now !== width) onResize(d.now);
      }}
      onDoubleClick={(e) => set(e.currentTarget, range.initial)}
      onKeyDown={(e) => {
        const by = e.key === "ArrowRight" ? STEP : e.key === "ArrowLeft" ? -STEP : 0;
        if (by) {
          e.preventDefault();
          set(e.currentTarget, width + dir * by);
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          set(e.currentTarget, e.key === "Home" ? range.min : range.max);
        }
      }}
    />
  );
}
