import { describe, expect, it } from "vitest";
import { commitsBetween, defaultBody, defaultTitle, humanize, pickBase, pushNeed, remoteBranches } from "./prDraft";
import type { CommitInfo, RefInfo } from "./types";

const c = (id: string, ...parents: string[]): CommitInfo => ({
  id,
  parents,
  summary: `Do ${id}`,
  message: `Do ${id}\n`,
  author: "a",
  email: "a@x",
  time: 0,
});
const ref = (name: string, target: string, kind: RefInfo["kind"] = "local"): RefInfo => ({ name, kind, target });

// a ← b ← c (main) ; b ← d ← e (topic), newest first
const history = [c("e", "d"), c("d", "b"), c("c", "b"), c("b", "a"), c("a")];

describe("pull request drafts", () => {
  it("collects the commits the head has and the base lacks, newest first", () => {
    expect(commitsBetween(history, "e", "c").map((x) => x.id)).toEqual(["e", "d"]);
    expect(commitsBetween(history, "c", "e").map((x) => x.id)).toEqual(["c"]);
    expect(commitsBetween(history, "e", null)).toHaveLength(4);
    expect(commitsBetween(history, "b", "c")).toEqual([]);
  });

  it("lists a remote's branches and picks the default one as base", () => {
    const refs = [
      ref("origin/HEAD", "c", "remote"),
      ref("origin/main", "c", "remote"),
      ref("origin/dev", "e", "remote"),
      ref("upstream/main", "c", "remote"),
      ref("main", "c"),
    ];
    expect(remoteBranches(refs, "origin")).toEqual(["dev", "main"]);
    expect(pickBase(["dev", "main"], "topic", "dev")).toBe("dev");
    expect(pickBase(["dev", "main"], "topic", "gone")).toBe("main");
    expect(pickBase(["dev", "master"], "topic", null)).toBe("master");
    expect(pickBase(["dev", "main"], "main", "main")).toBe("dev");
    expect(pickBase(["topic"], "topic", null)).toBeNull();
  });

  it("titles a one-commit request after its commit, and a longer one after the branch", () => {
    const one = [{ ...c("e"), summary: "Zoom to cursor", message: "Zoom to cursor\n\nKeeps the point still.\n" }];
    expect(defaultTitle("feature/graph-zoom", one)).toBe("Zoom to cursor");
    expect(defaultBody(one)).toBe("Keeps the point still.");
    const two = commitsBetween(history, "e", "c");
    expect(defaultTitle("feature/graph-zoom", two)).toBe("Graph zoom");
    expect(defaultBody(two)).toBe("- Do d\n- Do e");
    expect(humanize("fix_lane-overlap")).toBe("Fix lane overlap");
    expect(humanize("feature/")).toBe("feature/");
  });

  it("says when the branch must be pushed first", () => {
    const refs = [
      ref("topic", "e"),
      ref("origin/topic", "d", "remote"),
      ref("main", "c"),
      ref("origin/main", "c", "remote"),
    ];
    expect(pushNeed(history, refs, "origin", "topic")).toEqual({ kind: "ahead", n: 1 });
    expect(pushNeed(history, refs, "origin", "main")).toEqual({ kind: "none" });
    expect(pushNeed(history, refs, "upstream", "topic")).toEqual({ kind: "missing" });
    // The copy there is ahead (someone else pushed): nothing of ours is missing.
    const behind = [ref("topic", "d"), ref("origin/topic", "e", "remote")];
    expect(pushNeed(history, behind, "origin", "topic")).toEqual({ kind: "none" });
  });
});
