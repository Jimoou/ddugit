import { describe, expect, it } from "vitest";
import type { CommitInfo, RefInfo } from "../types";
import { searchCommits } from "./search";

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
