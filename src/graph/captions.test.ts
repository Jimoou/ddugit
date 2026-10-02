import { describe, expect, it } from "vitest";
import { CAPTION_H, laneReach, placeCaptions } from "./captions";
import type { Layout } from "./layout";

const star = (x: number, y: number, r = 6) => ({ x: x - r - 2, y: y - r - 2, w: 2 * r + 4, h: 2 * r + 4 });
const item = (id: string, x: number, y: number, w = 150, up = true) => ({ id, x, y, w, up });

describe("map-style commit captions", () => {
  it("hang right under their star, starting at it and reading to the right", () => {
    const [c] = placeCaptions([item("a", 100, 100)], [star(100, 100)], 6);
    expect(c).toMatchObject({ id: "a", x: 94, y: 111, w: 150, level: 0, above: false });
    // A short summary is placed whole.
    expect(placeCaptions([item("b", 100, 100, 40)], [], 6)[0].w).toBe(40);
  });

  it("take the next free slot when a neighbour's label is in the way, the most important placed first", () => {
    // Two stars 84 px apart on one lane: the second can't hang under itself (the first label runs there).
    const placed = placeCaptions([item("head", 100, 100), item("next", 184, 100)], [star(100, 100), star(184, 100)], 6);
    expect(placed[0]).toMatchObject({ id: "head", level: 0, above: false });
    expect(placed[1]).toMatchObject({ id: "next", level: 0, above: true });
  });

  it("step further out (with a leader line) when the spot under the star is taken and badges sit above", () => {
    const badge = { x: 120, y: 110, w: 60, h: 14 };
    const [c] = placeCaptions([item("b", 100, 100, 150, false)], [star(100, 100), badge], 6);
    expect(c).toMatchObject({ id: "b", level: 1, above: false, y: 111 + CAPTION_H });
  });

  it("never run a leader line through another label", () => {
    // The first label runs under the second star: the second can't reach past it.
    const placed = placeCaptions(
      [item("a", 100, 100), item("b", 184, 100, 150, false)],
      [star(100, 100), star(184, 100)],
      6,
    );
    expect(placed.map((c) => c.id)).toEqual(["a"]);
  });

  it("shorten before giving up, and leave out a label with no room at all", () => {
    // A badge just right of the star's own spot leaves room for a short label only.
    const badge = { x: 240, y: 105, w: 80, h: 60 };
    const [c] = placeCaptions([item("a", 100, 100, 300, false)], [badge], 6);
    expect(c.w).toBe(120);
    const wall = { x: 0, y: 0, w: 1000, h: 1000 };
    expect(placeCaptions([item("a", 100, 100)], [wall], 6)).toEqual([]);
  });
});

describe("laneReach", () => {
  it("is the furthest lane used by a commit or a line passing through each row", () => {
    const layout = {
      rowCount: 4,
      nodes: [
        { row: 0, lane: 0 },
        { row: 1, lane: 2 },
        { row: 3, lane: 0 },
      ],
      edges: [{ childRow: 0, parentRow: 3, via: 1 }],
    } as unknown as Layout;
    expect(laneReach(layout)).toEqual([0, 2, 1, 0]);
  });
});
