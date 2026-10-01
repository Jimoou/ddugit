import { describe, expect, it } from "vitest";
import type { CommitInfo } from "./types";
import { move, planMove, planProblem, rebaseRange, resultCount } from "./rebasePlan";

const c = (id: string, ...parents: string[]): CommitInfo => ({
  id,
  parents,
  summary: id,
  message: id,
  author: "a",
  email: "a@a",
  time: 0,
});
const byId = (...cs: CommitInfo[]) => new Map(cs.map((x) => [x.id, x]));

describe("rebaseRange", () => {
  const repo = byId(c("d", "c"), c("c", "b"), c("b", "a"), c("a"));
  it("lists the commits after base, oldest first", () => {
    expect((rebaseRange(repo, "d", "a") as CommitInfo[]).map((x) => x.id)).toEqual(["b", "c", "d"]);
    expect(rebaseRange(repo, "d", "d")).toEqual([]);
  });
  it("explains when base is not an ancestor or a merge is in the way", () => {
    expect(rebaseRange(repo, "d", "zzz")).toMatch(/이력에 없어요/);
    const merged = byId(c("m", "b", "x"), c("x", "a"), c("b", "a"), c("a"));
    expect(rebaseRange(merged, "m", "a")).toMatch(/병합/);
  });
});

describe("plans", () => {
  it("rejects squashing into nothing and dropping everything", () => {
    expect(
      planProblem([
        { id: "a", action: "pick" },
        { id: "b", action: "squash" },
      ]),
    ).toBeNull();
    expect(
      planProblem([
        { id: "a", action: "drop" },
        { id: "b", action: "fixup" },
      ]),
    ).toMatch(/합칠 대상/);
    expect(planProblem([{ id: "a", action: "drop" }])).toMatch(/하나는/);
  });
  it("counts what is left and moves steps", () => {
    const steps = [
      { id: "a", action: "pick" as const },
      { id: "b", action: "fixup" as const },
      { id: "c", action: "drop" as const },
      { id: "d", action: "pick" as const },
    ];
    expect(resultCount(steps)).toBe(2);
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
  });
});

describe("planMove", () => {
  // root → a → b → c → d (HEAD)
  const repo = byId(c("d", "c"), c("c", "b"), c("b", "a"), c("a", "root"), c("root"));
  const order = (p: ReturnType<typeof planMove>) => p && [p.base, ...p.steps.map((s) => s.id)];
  it("moves a newer commit down to just after the target", () => {
    expect(order(planMove(repo, "d", "d", "a"))).toEqual(["root", "a", "d", "b", "c"]);
  });
  it("moves an older commit up past newer ones", () => {
    expect(order(planMove(repo, "d", "b", "c"))).toEqual(["a", "c", "b", "d"]);
  });
  it("refuses no-op moves, commits off the line and the root", () => {
    expect(planMove(repo, "d", "c", "b")).toBeNull(); // c already follows b
    expect(planMove(repo, "d", "c", "zzz")).toBeNull();
    expect(planMove(repo, "d", "root", "c")).toBeNull();
    const merged = byId(c("m", "x", "y"), c("x", "a"), c("y", "a"), c("a"));
    expect(planMove(merged, "m", "x", "a")).toBeNull();
  });
});
