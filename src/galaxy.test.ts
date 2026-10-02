import { describe, expect, it } from "vitest";
import { fetchable, signals, tally } from "./galaxy";
import type { RepoGlance } from "./types";

const g = (path: string, o: Partial<RepoGlance> = {}): RepoGlance => ({
  path,
  error: null,
  branch: "main",
  upstream: "origin/main",
  ahead: 0,
  behind: 0,
  changes: 0,
  conflicts: 0,
  state: "clean",
  stashes: 0,
  remotes: 1,
  last: null,
  ...o,
});

describe("galaxy", () => {
  it("reads a repository's signals, most urgent first", () => {
    expect(signals(g("/a"))).toEqual([]);
    expect(signals(g("/a", { ahead: 2, behind: 1, changes: 3, stashes: 1 })).map((l) => l.signal)).toEqual([
      "changes",
      "behind",
      "ahead",
      "stash",
    ]);
    expect(signals(g("/a", { state: "merge", conflicts: 2, changes: 2 }))[0]).toEqual({ signal: "stopped", n: 2 });
    // A missing folder says only that.
    expect(signals(g("/a", { error: "gone", changes: 4 }))).toEqual([{ signal: "missing", n: 0 }]);
  });

  it("tallies worlds per signal and picks what fetch-all reaches", () => {
    const list = [
      g("/a", { changes: 1 }),
      g("/b", { changes: 2, behind: 1 }),
      g("/c", { error: "gone" }),
      g("/d", { remotes: 0 }),
    ];
    expect(tally(list)).toEqual([
      { signal: "missing", n: 1 },
      { signal: "changes", n: 2 },
      { signal: "behind", n: 1 },
    ]);
    expect(fetchable(list)).toEqual(["/a", "/b"]);
  });
});
