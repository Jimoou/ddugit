import { describe, expect, it } from "vitest";
import { between, syncPlan } from "./sync";
import type { CommitInfo, RepoSnapshot } from "./types";

const c = (id: string, ...parents: string[]): CommitInfo => ({
  id,
  parents,
  summary: id,
  message: id,
  author: "a",
  email: "a@x",
  time: 0,
});
// a ← b ← c (HEAD, main); b ← d (origin/main)
const commits = [c("c", "b"), c("d", "b"), c("b", "a"), c("a")];
const snap = (upstream: string | null, remoteTip = "d") =>
  ({
    commits,
    refs: [{ name: "origin/main", kind: "remote", target: remoteTip }],
    head: { branch: "main", target: "c", upstream, ahead: 1, behind: 1 },
    changes: [],
  }) as unknown as RepoSnapshot;

describe("sync plans", () => {
  it("lists what a push sends and a pull brings", () => {
    expect(between(commits, "c", "d").map((x) => x.id)).toEqual(["c"]);
    expect(syncPlan(snap("origin/main"), "push").commits.map((x) => x.id)).toEqual(["c"]);
    expect(syncPlan(snap("origin/main"), "pull").commits.map((x) => x.id)).toEqual(["d"]);
    expect(syncPlan(snap("origin/main"), "fetch").commits).toEqual([]);
  });

  it("before the first push, lists the commits no remote branch has", () => {
    const p = syncPlan(snap(null), "push");
    expect(p.upstream).toBeNull();
    expect(p.commits.map((x) => x.id)).toEqual(["c"]);
  });
});
