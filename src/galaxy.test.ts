import { describe, expect, it } from "vitest";
import {
  CHART_R,
  CHART_RINGS,
  chart,
  placeLabels,
  fetchable,
  pullable,
  radiusOf,
  signals,
  switchable,
  tally,
  tone,
} from "./galaxy";
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
  origin: null,
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

  it("pulls only branches with an upstream, and switches none stopped mid-operation", () => {
    const list = [
      g("/ok"),
      g("/detached", { branch: null }),
      g("/local", { upstream: null }),
      g("/merging", { state: "merge" }),
      g("/gone", { error: "missing" }),
    ];
    expect(pullable(list)).toEqual(["/ok"]);
    expect(switchable(list)).toEqual(["/ok", "/detached", "/local"]);
  });
});

describe("star chart", () => {
  const now = 1_000_000_000;
  const ago = (hours: number) => now - hours * 3600;

  it("colours a star by the most urgent thing about it", () => {
    expect(tone(undefined)).toBe("unread");
    expect(tone(g("/a", { error: "gone" }))).toBe("missing");
    expect(tone(g("/a", { state: "merge", changes: 2 }))).toBe("stopped");
    expect(tone(g("/a", { changes: 1, behind: 3 }))).toBe("changes");
    expect(tone(g("/a", { behind: 3, ahead: 1 }))).toBe("behind");
    expect(tone(g("/a", { ahead: 1 }))).toBe("clean");
  });

  it("puts newer work nearer the centre, a day, a week, a month and a year on the rings", () => {
    expect(radiusOf(0)).toBeGreaterThan(0);
    for (const ring of CHART_RINGS) expect(radiusOf(ring.hours)).toBeCloseTo(ring.r);
    expect(radiusOf(5 * 365 * 24)).toBe(CHART_R);
    expect(radiusOf(null)).toBe(CHART_R);
    for (const [a, b] of [
      [1, 5],
      [30, 200],
      [400, 2000],
    ])
      expect(radiusOf(a)).toBeLessThan(radiusOf(b));
  });

  it("gives each group a slice in order, the most recent first, and its name outside its stars", () => {
    const times: Record<string, number> = { "/a": ago(300), "/b": ago(2), "/c": ago(50) };
    const [work, loose] = chart(
      [
        { id: "work", paths: ["/a", "/b"] },
        { id: "empty", paths: [] },
        { id: null, paths: ["/c"] },
      ],
      (p) => times[p] ?? null,
      now,
    );
    expect(work.id).toBe("work");
    expect(loose.id).toBeNull();
    // Empty groups take no room.
    expect(work.stars.map((s) => s.path)).toEqual(["/b", "/a"]);
    const dist = (s: { x: number; y: number }) => Math.hypot(s.x, s.y);
    expect(dist(work.stars[0])).toBeLessThan(dist(work.stars[1]));
    expect(work.stars[0].size).toBeGreaterThan(work.stars[1].size);
    // The first slice starts at the top and runs clockwise (to the right).
    expect(work.stars[0].x).toBeGreaterThan(0);
    expect(dist(work.label)).toBeGreaterThan(Math.max(...work.stars.map(dist)));
  });
});

describe("star names", () => {
  const star = (x: number, y: number) => ({ x, y, size: 4, name: 60, sub: 90 });

  it("hangs a name on the outer side with its line, and keeps two names apart", () => {
    const [a, b, c] = placeLabels([star(50, 0), star(-50, 0), star(52, 6)], []);
    expect(a).toEqual({ side: "right", sub: true });
    expect(b).toEqual({ side: "left", sub: true });
    // Its own side is taken, and the other side has room for the name alone.
    expect(c).toEqual({ side: "left", sub: false });
    // Boxed in on both sides: the name waits for a hover.
    expect(placeLabels([star(50, 0)], [{ x: -300, y: -20, w: 600, h: 40 }])).toEqual([null]);
  });

  it("drops the line under a name before dropping the name, and steers clear of fixed marks", () => {
    const [a, b] = placeLabels([star(50, 0), star(50, 20)], []);
    expect(a).toEqual({ side: "right", sub: true });
    expect(b).toEqual({ side: "left", sub: true });
    const [c] = placeLabels([star(50, 0)], [{ x: 60, y: -20, w: 200, h: 40 }]);
    expect(c).toEqual({ side: "left", sub: true });
  });
});
