import { describe, expect, it } from "vitest";
import { CAPTION_DROP, captionHeight, laneReach, placeCaptions } from "./captions";
import type { Layout } from "./layout";

const star = (x: number, y: number, r = 6) => ({ x: x - r - 2, y: y - r - 2, w: 2 * r + 4, h: 2 * r + 4 });

describe("map-style commit captions", () => {
  const two = { lines: ["Fix crash on", "empty repo"], w: 90, h: captionHeight(2) };
  const one = { lines: ["Fix crash on e…"], w: 110, h: captionHeight(1) };
  const item = (id: string, x: number, y: number, up = true) => ({ id, x, y, shapes: [two, one], up });

  it("sit centred under their star, in two lines when they need them", () => {
    const [c] = placeCaptions([item("a", 100, 100)], [star(100, 100)], 6);
    expect(c).toMatchObject({ id: "a", x: 55, y: 106 + CAPTION_DROP, w: 90, lines: two.lines, above: false });
  });

  it("fall back to one line, then to the spot above, when something is in the way", () => {
    // A badge just under the two-line panel's second line: one line still fits.
    const low = { x: 40, y: 106 + CAPTION_DROP + captionHeight(1) + 2, w: 120, h: 14 };
    expect(placeCaptions([item("a", 100, 100)], [low], 6)[0]).toMatchObject({ lines: one.lines, above: false });
    // Right under the star is taken: above, when the star has no badges there.
    const under = { x: 40, y: 108, w: 120, h: 60 };
    expect(placeCaptions([item("a", 100, 100)], [under], 6)[0]).toMatchObject({ above: true });
    expect(placeCaptions([item("a", 100, 100, false)], [under], 6)).toEqual([]);
  });

  it("never cover each other: the more important one keeps its spot", () => {
    const placed = placeCaptions([item("head", 100, 100), item("next", 140, 100, false)], [], 6);
    expect(placed.map((c) => c.id)).toEqual(["head"]);
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
