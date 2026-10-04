import { describe, expect, it } from "vitest";
import { stackGroups } from "./stack";
import type { StackBranch } from "./types";

const b = (name: string, parent: string, behind = false): StackBranch => ({
  name,
  parent,
  behind,
  parentMissing: false,
  own: 1,
});

describe("stackGroups", () => {
  it("lists each stack from its lowest branch, children under their parent", () => {
    const groups = stackGroups([b("docs", "ui"), b("api", "main"), b("ui", "api", true), b("fix", "release")]);
    expect(groups.map((g) => g.base)).toEqual(["main", "release"]);
    expect(groups[0].rows.map((r) => [r.branch.name, r.depth])).toEqual([
      ["api", 0],
      ["ui", 1],
      ["docs", 2],
    ]);
    expect(groups.map((g) => g.behind)).toEqual([true, false]);
  });
  it("branches off the same parent stay in one stack", () => {
    const groups = stackGroups([b("api", "main"), b("ui", "api"), b("cli", "api")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows.map((r) => r.depth)).toEqual([0, 1, 1]);
  });
});
