import { describe, expect, it } from "vitest";
import type { CommitInfo } from "../types";
import { addPicks, firstParentLine, inHistoryOrder, togglePick } from "./pickList";

const c = (id: string, ...parents: string[]): CommitInfo => ({
  id,
  parents,
  summary: id,
  message: id,
  author: "a",
  email: "a@x",
  time: 0,
});

// a ← b ← m (merge of b and f) ← d;  a ← f (side branch)
const byId = new Map([c("a"), c("b", "a"), c("f", "a"), c("m", "b", "f"), c("d", "m")].map((x) => [x.id, x]));

describe("picked commits", () => {
  it("toggles one at a time and adds a line once", () => {
    expect(togglePick([], "a")).toEqual(["a"]);
    expect(togglePick(["a", "b"], "a")).toEqual(["b"]);
    expect(addPicks(["b"], ["d", "m", "b"])).toEqual(["b", "d", "m"]);
  });

  it("finds the first-parent line between two commits, either way round", () => {
    expect(firstParentLine(byId, "d", "a")).toEqual(["d", "m", "b", "a"]);
    expect(firstParentLine(byId, "b", "d")).toEqual(["d", "m", "b"]);
    expect(firstParentLine(byId, "d", "d")).toEqual(["d"]);
    // `f` came in through the merge's second parent: not on the line.
    expect(firstParentLine(byId, "d", "f")).toBeNull();
    expect(firstParentLine(byId, "b", "f")).toBeNull();
  });

  it("orders them as history goes", () => {
    const order = new Map(["d", "m", "f", "b", "a"].map((id, i) => [id, i]));
    expect(inHistoryOrder(["a", "d", "b"], order, true)).toEqual(["a", "b", "d"]);
    expect(inHistoryOrder(["a", "d", "b"], order, false)).toEqual(["d", "b", "a"]);
  });
});
