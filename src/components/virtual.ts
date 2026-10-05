import { type RefObject, useEffect, useState } from "react";

/** Long lists draw only the rows near the viewport; shorter ones keep every row (find in page, select all). */
export const VIRTUAL_MIN = 400;
/** Extra height drawn above and below the viewport, px. */
const OVERSCAN = 600;

/** Top of every row and the total height (one more entry), from per-row heights. */
export function offsets(heights: ArrayLike<number>): Float64Array {
  const tops = new Float64Array(heights.length + 1);
  for (let i = 0; i < heights.length; i++) tops[i + 1] = tops[i] + heights[i];
  return tops;
}

/** Rows `[start, end)` that meet the band `top..top + height` (widened by `overscan`). */
export function visibleRows(
  tops: Float64Array,
  top: number,
  height: number,
  overscan = OVERSCAN,
): { start: number; end: number } {
  const count = tops.length - 1;
  if (count <= VIRTUAL_MIN) return { start: 0, end: count };
  const from = top - overscan,
    to = top + height + overscan;
  // First row whose bottom is below `from`.
  let lo = 0,
    hi = count;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid + 1] <= from) lo = mid + 1;
    else hi = mid;
  }
  const start = lo;
  hi = count;
  // First row whose top is at or past `to`.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tops[mid] < to) lo = mid + 1;
    else hi = mid;
  }
  return { start, end: Math.max(start, lo) };
}

/**
 * The rows of `tops` to draw in `list`, which scrolls itself or sits in the
 * nearest ancestor matching `scroller`. State changes only when that range
 * does, not on every scroll event.
 */
export function useVisibleRows(list: RefObject<HTMLElement | null>, tops: Float64Array, scroller?: string) {
  const [view, setView] = useState({ top: 0, height: 800 });
  useEffect(() => {
    const el = list.current;
    const box = scroller ? el?.closest<HTMLElement>(scroller) : el;
    if (!el || !box) return;
    const read = () =>
      setView((v) => {
        // Where the list starts inside the scrolling box's content.
        const start = box === el ? 0 : el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
        const next = { top: box.scrollTop - start, height: box.clientHeight };
        const a = visibleRows(tops, v.top, v.height),
          b = visibleRows(tops, next.top, next.height);
        return a.start === b.start && a.end === b.end ? v : next;
      });
    read();
    box.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(box);
    return () => {
      box.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, [list, tops, scroller]);
  return visibleRows(tops, view.top, view.height);
}
