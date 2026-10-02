import { describe, expect, it } from "vitest";
import { byFolder } from "./ChangedFiles";
import type { FileDiff } from "../types";

const f = (path: string) => ({ path, status: "modified", additions: 1, deletions: 0 }) as FileDiff;

describe("byFolder", () => {
  it("groups files by folder, root files first, folders in path order", () => {
    const groups = byFolder([f("src/b.ts"), f("README.md"), f("e2e/x.ts"), f("src/a.ts")]);
    expect(groups.map((g) => [g.dir, g.files.map((x) => x.path)])).toEqual([
      ["", ["README.md"]],
      ["e2e/", ["e2e/x.ts"]],
      ["src/", ["src/b.ts", "src/a.ts"]],
    ]);
  });
});
