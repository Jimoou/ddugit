import { describe, expect, it } from "vitest";
import { needsToken, prLabel, prOf, prRefs, tokenPage } from "./Pulls";
import type { ForgeStatus, PrReport, PullRequest } from "../types";

const forge = (over: Partial<ForgeStatus> = {}): ForgeStatus => ({
  remote: "origin",
  kind: "github",
  host: "github.com",
  slug: "o/r",
  token: "cli",
  public: true,
  unauthorized: false,
  error: null,
  ...over,
});
const pr = (number: number, sha: string, remote = "origin"): PullRequest => ({
  remote,
  number,
  title: `PR ${number}`,
  url: `https://github.com/o/r/pull/${number}`,
  draft: false,
  branch: `b${number}`,
  sha,
  author: "a",
  state: "open",
  checks: null,
  review: null,
});

describe("pull request labels", () => {
  it("uses # on GitHub, ! on GitLab, and names the remote when there are several forges", () => {
    const one: PrReport = { forges: [forge()], prs: [pr(7, "a")] };
    expect(prLabel(one.prs[0], one)).toBe("#7");
    const two: PrReport = {
      forges: [forge(), forge({ remote: "upstream", kind: "gitlab", host: "gitlab.com" })],
      prs: [pr(7, "a"), pr(3, "b", "upstream")],
    };
    expect(two.prs.map((p) => prLabel(p, two))).toEqual(["origin #7", "upstream !3"]);
  });

  it("labels only commits in the loaded history and maps a label back to its PR", () => {
    const report: PrReport = { forges: [forge()], prs: [pr(1, "in"), pr(2, "out")] };
    const refs = prRefs(report, (id) => id === "in");
    expect(refs).toEqual([{ name: "#1", kind: "pr", target: "in", checks: null, review: null }]);
    expect(prOf(report, refs[0])?.number).toBe(1);
    expect(prRefs(null, () => true)).toEqual([]);
    // Merged and closed ones stay in the sidebar only: no graph label.
    const done: PrReport = { forges: [forge()], prs: [{ ...pr(2, "in"), state: "merged" }] };
    expect(prRefs(done, () => true)).toEqual([]);
  });
});

describe("pull request status on labels", () => {
  it("carries CI for the label color and the review for its mark", () => {
    const approved = { ...pr(4, "a"), checks: "failure" as const, review: "approved" as const };
    const report: PrReport = { forges: [forge()], prs: [approved, { ...pr(5, "b"), review: "changes" }] };
    const refs = prRefs(report, () => true);
    expect(refs.map((r) => [r.name, r.checks, r.review])).toEqual([
      ["#4", "failure", "approved"],
      ["#5", null, "changes"],
    ]);
    expect(prOf(report, refs[0])?.number).toBe(4);
  });
});

describe("connecting a forge", () => {
  it("asks for a token when none is found or the saved one was refused", () => {
    expect(needsToken({ forges: [forge()], prs: [] })).toBeUndefined();
    expect(needsToken({ forges: [forge({ token: "none" })], prs: [] })?.token).toBe("none");
    expect(needsToken({ forges: [forge({ token: "keychain", unauthorized: true })], prs: [] })).toBeDefined();
  });

  it("links to a token page with just the needed scope", () => {
    expect(tokenPage({ kind: "github", host: "github.com" })).toBe(
      "https://github.com/settings/tokens/new?scopes=repo&description=ddugit",
    );
    expect(tokenPage({ kind: "gitlab", host: "gitlab.example.com" })).toContain("scopes=read_api");
  });
});
