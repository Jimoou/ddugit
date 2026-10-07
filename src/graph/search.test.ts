import { describe, expect, it } from "vitest";
import type { CommitInfo, RefInfo } from "../types";
import { nextLimit, searchCommits, searchKey } from "./search";

const c = (id: string, message: string, author = "Jimin", email = "jimin@ddugit.dev"): CommitInfo => ({
  id,
  parents: [],
  summary: message.split("\n")[0],
  message,
  author,
  email,
  time: 0,
});

const commits = [
  c("a1b2c3d4e5", "Fix crash on empty repo"),
  c("ff00aa11bb", "Add minimap\n\nDetails about ZOOM", "Seoyeon", "sy@example.com"),
  c("1234abcd99", "Bump deps"),
];
const refs: RefInfo[] = [{ name: "feature/zoom", kind: "local", target: "1234abcd99" }];

describe("searchCommits", () => {
  it("matches message text case-insensitively, including the body", () => {
    expect(searchCommits(commits, [], "CRASH")).toEqual(["a1b2c3d4e5"]);
    expect(searchCommits(commits, [], "details about")).toEqual(["ff00aa11bb"]);
  });

  it("matches author and email", () => {
    expect(searchCommits(commits, [], "seoyeon")).toEqual(["ff00aa11bb"]);
    expect(searchCommits(commits, [], "example.com")).toEqual(["ff00aa11bb"]);
  });

  it("matches SHA prefixes of 4+ hex chars only", () => {
    expect(searchCommits(commits, [], "a1b2")).toEqual(["a1b2c3d4e5"]);
    expect(searchCommits(commits, [], "a1b")).toEqual([]);
  });

  it("matches ref names and keeps newest-first order", () => {
    expect(searchCommits(commits, refs, "zoom")).toEqual(["ff00aa11bb", "1234abcd99"]);
  });

  it("returns nothing for a blank query", () => {
    expect(searchCommits(commits, refs, "  ")).toEqual([]);
  });
});

describe("nextLimit", () => {
  it("doubles the history read, from at least a thousand, up to the cap", () => {
    expect(nextLimit(3000)).toBe(6000);
    expect(nextLimit(100)).toBe(1000);
    expect(nextLimit(40_000, 50_000)).toBe(50_000);
    expect(nextLimit(50_000, 50_000)).toBeNull();
  });
});

describe("searchKey", () => {
  it("tells searches apart by mode, regex and trimmed query", () => {
    expect(searchKey("message", " fix ", false)).toBe(searchKey("message", "fix", false));
    expect(searchKey("message", "fix", false)).not.toBe(searchKey("author", "fix", false));
    expect(searchKey("message", "fix", false)).not.toBe(searchKey("message", "fix", true));
  });
});
