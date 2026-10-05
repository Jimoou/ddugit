import { describe, expect, it } from "vitest";
import type { CommitInfo, RefInfo } from "../types";
import { computeLayout } from "./layout";
import { runIndex, runsInRows, straightRuns } from "./runs";

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

/** Linear history c9 → … → c0 (c9 newest). */
const line = (n: number) =>
  Array.from({ length: n }, (_, i) => c(`c${n - 1 - i}`, ...(i < n - 1 ? [`c${n - 2 - i}`] : [])));

describe("straightRuns", () => {
  it("folds the inside of a linear history, not its tip or root", () => {
    const l = computeLayout(line(10), [local("main", "c9")], { branch: "main", target: "c9" });
    const runs = straightRuns(l, (id) => id === "c9");
    // c9 has the ref, c0 has no parent: c8..c1 fold.
    expect(runs).toHaveLength(1);
    expect(runs[0].ids).toEqual(["c8", "c7", "c6", "c5", "c4", "c3", "c2", "c1"]);
    expect([runs[0].first, runs[0].last]).toEqual([1, 8]);
  });

  it("splits at kept commits and drops runs shorter than min", () => {
    const l = computeLayout(line(10), [], { branch: "main", target: "c9" });
    const runs = straightRuns(l, (id) => id === "c5" || id === "c2");
    // c8..c6 (3) and c4..c3 (2) and c1 (1): only the first reaches min 3.
    expect(straightRuns(l, (id) => id === "c5" || id === "c2", 3).map((r) => r.ids)).toEqual([["c8", "c7", "c6"]]);
    expect(runs).toEqual([]);
  });

  it("stops at merges and fork points", () => {
    //   m ← main (merges f2)
    //   | \
    //   x4  f2
    //   x3  f1
    //   x2 /
    //   x1
    //   a
    const commits = [
      c("m", "x4", "f2"),
      c("f2", "f1"),
      c("x4", "x3"),
      c("f1", "x2"),
      c("x3", "x2"),
      c("x2", "x1"),
      c("x1", "a"),
      c("a"),
    ];
    const l = computeLayout(commits, [local("main", "m")], { branch: "main", target: "m" });
    const ids = straightRuns(l, () => false, 2).flatMap((r) => r.ids);
    // x2 has two children (fork point) and m is a merge: neither folds.
    expect(ids).not.toContain("x2");
    expect(ids).not.toContain("m");
    // f1/f2 sit on rows interleaved with x3/x4, so they are not consecutive rows.
    expect(ids).not.toContain("f1");
    expect(runIndex(straightRuns(l, () => false, 2)).size).toBe(ids.length);
  });
});

describe("runsInRows", () => {
  const run = (first: number, last: number) => ({ lane: 0, color: 0, first, last, ids: [] });
  const runs = [run(0, 4), run(6, 9), run(12, 30), run(40, 41)];
  it("returns the runs reaching into a span of rows", () => {
    expect(runsInRows(runs, 5, 5)).toEqual([]);
    expect(runsInRows(runs, 4, 6)).toEqual([runs[0], runs[1]]);
    expect(runsInRows(runs, 20, 100)).toEqual([runs[2], runs[3]]);
    expect(runsInRows([], 0, 10)).toEqual([]);
  });
});
