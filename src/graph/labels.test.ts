import { describe, expect, it } from "vitest";
import { inlineBadges, placeBadges } from "./labels";

const H = 18;

describe("placeBadges", () => {
  it("leaves far-apart groups at their natural height", () => {
    const [a, b] = placeBadges([
      { x: 0, baseY: 100, widths: [60] },
      { x: 300, baseY: 100, widths: [60, 80] },
    ]);
    expect(a.lift).toBe(0);
    expect(b.lift).toBe(0);
    expect(a.badges[0]).toEqual({ index: 0, x: -30, y: 100 - H, w: 60 });
    expect(b.badges.map((x) => x.y)).toEqual([100 - H, 100 - H - 22]);
  });

  it("lifts a neighbour whose badges would overlap", () => {
    const [a, b] = placeBadges([
      { x: 0, baseY: 100, widths: [120] },
      { x: 60, baseY: 100, widths: [120] },
    ]);
    expect(a.lift).toBe(0);
    expect(b.lift).toBe(1);
    expect(b.badges[0].y).toBe(100 - H - 22);
  });

  it("places priority groups first so they never move", () => {
    const [a, head] = placeBadges([
      { x: 0, baseY: 100, widths: [120] },
      { x: 60, baseY: 100, widths: [120], priority: true },
    ]);
    expect(head.lift).toBe(0);
    expect(a.lift).toBe(1);
  });

  it("folds a crowded stack into first badge + overflow chip", () => {
    const wall = Array.from({ length: 6 }, (_, i) => ({ x: i * 10, baseY: 100, widths: [200] }));
    const res = placeBadges([...wall, { x: 30, baseY: 100, widths: [100, 100, 100] }], { maxLift: 2 });
    const last = res[res.length - 1];
    expect(last.hidden).toBe(2);
    expect(last.badges.map((b) => b.index)).toEqual([0, -1]);
  });

  it("skips empty groups", () => {
    const [g] = placeBadges([{ x: 0, baseY: 0, widths: [] }]);
    expect(g.badges).toEqual([]);
  });
});

describe("inlineBadges", () => {
  it("lines badges up away from the graph, leaving the rest of the row to the summary", () => {
    const right = inlineBadges(100, 1, 50, [40, 60]);
    expect(right.badges.map((b) => [b.x, b.y])).toEqual([
      [100, 41],
      [144, 41],
    ]);
    expect(right.end).toBe(210);
    const left = inlineBadges(100, -1, 50, [40]);
    expect(left.badges[0].x).toBe(60);
    expect(left.end).toBe(54);
    expect(inlineBadges(100, 1, 50, []).end).toBe(100);
  });
});
