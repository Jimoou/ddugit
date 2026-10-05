import { describe, expect, it } from "vitest";
import type { CommitInfo, RefInfo } from "../types";
import { ancestors, colorForBranch, computeLayout, descendantsOf } from "./layout";

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

describe("computeLayout", () => {
  it("keeps a linear history in one lane", () => {
    const commits = [c("c", "b"), c("b", "a"), c("a")];
    const l = computeLayout(commits, [local("main", "c")], { branch: "main", target: "c" });
    expect(l.nodes.map((n) => n.lane)).toEqual([0, 0, 0]);
    expect(l.edges).toHaveLength(2);
    expect(l.laneCount).toBe(1);
  });

  it("pins trunk to lane 0 and puts the feature branch beside it", () => {
    //   m (merge) ← main
    //   | \
    //   x  f2 ← feature
    //   |  f1
    //   | /
    //   a
    const commits = [c("m", "x", "f2"), c("f2", "f1"), c("x", "a"), c("f1", "a"), c("a")];
    const l = computeLayout(commits, [local("main", "m")], { branch: "main", target: "m" });
    const lane = (id: string) => l.byId.get(id)!.lane;
    expect([lane("m"), lane("x"), lane("a")]).toEqual([0, 0, 0]);
    expect(lane("f2")).toBe(1);
    expect(lane("f1")).toBe(1);
    const mergeEdge = l.edges.find((e) => e.child === "m" && e.parent === "f2")!;
    expect(mergeEdge.isMergeEdge).toBe(true);
    expect(mergeEdge.via).toBe(1);
    expect(l.byId.get("m")!.isMerge).toBe(true);
  });

  it("trunk stays in lane 0 even when a newer side branch comes first", () => {
    const commits = [c("f", "a"), c("b", "a"), c("a")];
    const l = computeLayout(commits, [local("main", "b"), local("feat", "f")], { branch: "feat", target: "f" });
    expect(l.byId.get("b")!.lane).toBe(0);
    expect(l.byId.get("f")!.lane).toBe(1);
  });

  it("skips edges to parents outside the loaded window", () => {
    const l = computeLayout([c("b", "a")], [], { branch: "main", target: "b" });
    expect(l.edges).toHaveLength(0);
    expect(l.nodes).toHaveLength(1);
  });

  it("handles an empty repository", () => {
    const l = computeLayout([], [], { branch: "main", target: null });
    expect(l.nodes).toHaveLength(0);
    expect(l.laneCount).toBe(1);
  });

  it("frees lanes so unrelated branches reuse them", () => {
    // Two short-lived side branches at different times should share lane 1.
    const commits = [
      c("m2", "m1", "s2"),
      c("s2", "m1b"),
      c("m1", "m1b"),
      c("m1b", "m0", "s1"),
      c("s1", "r"),
      c("m0", "r"),
      c("r"),
    ];
    const l = computeLayout(commits, [local("main", "m2")], { branch: "main", target: "m2" });
    expect(l.byId.get("s1")!.lane).toBe(1);
    expect(l.byId.get("s2")!.lane).toBe(1);
    expect(l.laneCount).toBe(2);
  });
});

describe("helpers", () => {
  it("gives main/master the trunk colour and other branches a stable one", () => {
    expect(colorForBranch("main")).toBe(0);
    expect(colorForBranch("origin/main")).toBe(0);
    expect(colorForBranch("feature/x")).toBe(colorForBranch("feature/x"));
    expect(colorForBranch("feature/x")).not.toBe(0);
  });

  it("collects ancestors", () => {
    const commits = [c("m", "x", "f"), c("f", "a"), c("x", "a"), c("a")];
    expect([...ancestors(commits, "f")].sort()).toEqual(["a", "f"]);
    expect(ancestors(commits, "m").size).toBe(4);
  });

  it("collects descendants within the loaded commits", () => {
    const commits = [c("m", "x", "f"), c("f", "a"), c("x", "a"), c("a", "root")];
    expect([...descendantsOf(commits, "f")].sort()).toEqual(["f", "m"]);
    expect(descendantsOf(commits, "a").size).toBe(4);
    expect(descendantsOf(commits, "root").size).toBe(0);
  });
});
