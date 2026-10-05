import { describe, expect, it } from "vitest";
import type { CommitInfo, RefInfo } from "../types";
import { computeLayout } from "./layout";
import { buildScene, COL, type EdgeShape, edgesInRows, fractionAtX, LANE, nodeAtCell, sparklesIn, xOf } from "./scene";

const c = (id: string, ...parents: string[]): CommitInfo => ({
  id,
  parents,
  summary: id,
  message: id,
  author: "a",
  email: "a@a",
  time: 0,
});
const local = (name: string, target: string): RefInfo => ({ name, kind: "local", target });

/** main: m3 → … → m0 (m3 newest); a side branch from m0 merged into m3 after `len` commits. */
function history(len: number) {
  const side = Array.from({ length: len }, (_, i) => c(`s${len - 1 - i}`, i < len - 1 ? `s${len - 2 - i}` : "m0"));
  const commits = [c("m3", "m2", `s${len - 1}`), ...side, c("m2", "m1"), c("m1", "m0"), c("m0")];
  return computeLayout(commits, [local("main", "m3")], { branch: "main", target: "m3" });
}

describe("buildScene", () => {
  it("bounds each edge by its rows and the lanes it runs through", () => {
    const layout = history(3);
    const scene = buildScene(layout);
    const n = layout.rowCount;
    const merge = scene.edges.find((e) => e.edge.isMergeEdge)!;
    expect([merge.minX, merge.maxX]).toEqual([xOf(merge.edge.parentRow, n), xOf(merge.edge.childRow, n)]);
    expect([merge.minY, merge.maxY]).toEqual([0, LANE]);
    // m2 → m1: both on the trunk.
    const trunk = scene.edges.find((e) => e.edge.child === "m2")!;
    expect([trunk.minY, trunk.maxY]).toEqual([0, 0]);
    expect(scene.width).toBe((n - 1) * COL);
  });

  it("finds the edges crossing a span of rows, long ones included, in layout order", () => {
    const layout = history(300);
    const scene = buildScene(layout);
    const brute = (a: number, b: number) =>
      scene.edges.filter((e) => e.edge.parentRow >= a && e.edge.childRow <= b).map((e) => e.edge);
    for (const [a, b] of [
      [0, 0],
      [5, 9],
      [120, 200],
      [250, layout.rowCount - 1],
    ])
      expect(edgesInRows(scene, a, b).map((e) => e.edge)).toEqual(brute(a, b));
    // The trunk edge m3 → m2 spans the whole side branch and shows anywhere in between.
    expect(edgesInRows(scene, 150, 151).some((e) => e.edge.child === "m3" && e.edge.parent === "m2")).toBe(true);
  });

  it("reads the commit at a row and lane", () => {
    const layout = history(2);
    expect(nodeAtCell(layout, 0, 0)).toBe("m3");
    expect(nodeAtCell(layout, 1, 1)).toBe("s1");
    expect(nodeAtCell(layout, 1, 0)).toBeUndefined();
    expect(nodeAtCell(layout, 99, 0)).toBeUndefined();
  });
});

describe("sparkles", () => {
  // A straight edge from x = 0 to x = 100.
  const shape = {
    samples: new Float32Array([0, 0, 50, 0, 100, 0]),
    cum: new Float32Array([0, 50, 100]),
    length: 100,
  } as EdgeShape;

  it("maps world x to a fraction of the edge", () => {
    expect(fractionAtX(shape, -10)).toBe(0);
    expect(fractionAtX(shape, 25)).toBeCloseTo(0.25);
    expect(fractionAtX(shape, 150)).toBe(1);
  });

  it("keeps the evenly spaced sparkles that fall in the window", () => {
    const all = (count: number, phase: number) =>
      Array.from({ length: count }, (_, i) => (((phase + i / count) % 1) + 1) % 1).sort((a, b) => a - b);
    const near = (a: number[], b: number[]) => expect(a.map((x) => x.toFixed(9))).toEqual(b.map((x) => x.toFixed(9)));
    near(
      sparklesIn(8, 2.3, 0, 0.999),
      all(8, 2.3).filter((t) => t <= 0.999),
    );
    near(
      sparklesIn(1000, -0.37, 0.4005, 0.4205),
      all(1000, -0.37).filter((t) => t >= 0.4005 && t <= 0.4205),
    );
    expect(sparklesIn(5, 0.1, 0.5, 0.5)).toEqual([]);
  });
});
