import { describe, expect, it } from "vitest";
import { offsets, VIRTUAL_MIN, visibleRows } from "./virtual";

describe("virtual rows", () => {
  it("adds up row tops", () => {
    expect([...offsets([10, 20, 5])]).toEqual([0, 10, 30, 35]);
  });

  it("draws every row of a short list", () => {
    const tops = offsets(Array(VIRTUAL_MIN).fill(20));
    expect(visibleRows(tops, 5000, 300)).toEqual({ start: 0, end: VIRTUAL_MIN });
  });

  it("draws the rows meeting the viewport and the overscan around it", () => {
    const tops = offsets(Array(10_000).fill(20));
    // Rows 500..514 are on screen; 100 px of overscan adds 5 on each side.
    expect(visibleRows(tops, 10_000, 300, 100)).toEqual({ start: 495, end: 520 });
    expect(visibleRows(tops, 0, 300, 100)).toEqual({ start: 0, end: 20 });
    expect(visibleRows(tops, 199_900, 300, 100)).toEqual({ start: 9990, end: 10_000 });
    // Mixed heights: a 32 px header then 19 px lines.
    const mixed = offsets([32, ...Array(999).fill(19)]);
    expect(visibleRows(mixed, 32 + 19 * 100, 19 * 10, 0)).toEqual({ start: 101, end: 111 });
  });
});
