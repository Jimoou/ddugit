import { describe, expect, it } from "vitest";
import { captionLength, SLANT } from "./captions";
import { COL, LANE } from "./scene";

const grid = (...cells: [number, number][]) => new Map(cells.map(([row, lane]) => [`${row}:${lane}`, "x"]));
const sin = Math.sin(SLANT),
  cos = Math.cos(SLANT);

describe("slanted commit captions", () => {
  it("run their full length over empty lanes or the bottom of the graph", () => {
    expect(captionLength(grid(), 10, 0, 4, 200)).toBe(200);
    expect(captionLength(grid([10, 0]), 10, 0, 1, 200)).toBe(200);
  });

  it("stop before a commit they would cross", () => {
    // At this slant the caption passes right over the commit three lanes down, two columns on.
    const dx = 2 * COL,
      dy = 3 * LANE;
    expect(Math.abs(dx * sin - dy * cos)).toBeLessThan(15);
    expect(captionLength(grid([8, 3]), 10, 0, 5, 400)).toBeLessThan(dx * cos + dy * sin);
  });

  it("stop before running alongside a caption starting on the lane below", () => {
    // Zoomed out, a line is tall in world units: the next-column commit one lane down starts a parallel caption too close.
    const gap = 25;
    const dx = COL,
      dy = LANE;
    expect(Math.abs(dx * sin - dy * cos)).toBeLessThan(gap);
    expect(captionLength(grid([9, 1]), 10, 0, 3, 400, gap)).toBeCloseTo(dx * cos + dy * sin - gap);
    // At normal zoom the same pair has room.
    expect(captionLength(grid([9, 1]), 10, 0, 3, 400, 12)).toBe(400);
  });

  it("can run up into the open sky instead, stopping before commits above", () => {
    // Top lane: nothing above, the whole length is free.
    expect(captionLength(grid([12, 1]), 10, 0, 3, 300, 14, -1)).toBe(300);
    // A commit on the lane above, a little to the right: its caption comes down across ours.
    const len = captionLength(grid([9, 0]), 10, 1, 3, 300, 14, -1);
    expect(len).toBeCloseTo(COL * cos + LANE * sin - 14);
  });

  it("never runs up through a caption coming down from the left", () => {
    expect(captionLength(grid([11, 0]), 10, 1, 3, 300, 14, -1)).toBe(0);
  });
});
