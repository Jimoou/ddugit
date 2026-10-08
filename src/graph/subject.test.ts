import { describe, expect, it } from "vitest";
import { parseSubject } from "./subject";

describe("parseSubject", () => {
  it("reads Conventional Commits types, scopes and breaking marks", () => {
    expect(parseSubject("feat(graph): semantic zoom")).toEqual({
      chip: { label: "feat", tone: "feat" },
      text: "semantic zoom",
      scope: "graph",
      pr: null,
      breaking: false,
    });
    expect(parseSubject("fix!: drop the old API").breaking).toBe(true);
    expect(parseSubject("ci: cache cargo").chip).toEqual({ label: "ci", tone: "chore" });
    expect(parseSubject("Docs: typo").chip).toEqual({ label: "docs", tone: "docs" });
  });

  it("leaves plain summaries and unknown prefixes as they are", () => {
    expect(parseSubject("Semantic zoom levels")).toEqual({
      chip: null,
      text: "Semantic zoom levels",
      scope: null,
      pr: null,
      breaking: false,
    });
    expect(parseSubject("Note: this is not a type").chip).toBeNull();
    expect(parseSubject("feat:no space").chip).toBeNull();
  });

  it("takes a trailing pull request number out of the text", () => {
    expect(parseSubject("fix: crash on empty repo (#15)")).toMatchObject({ text: "crash on empty repo", pr: "#15" });
    expect(parseSubject("Tune speed (#7)")).toMatchObject({ chip: null, text: "Tune speed", pr: "#7" });
  });

  it("shortens merges to what came into where", () => {
    expect(parseSubject("Merge branch 'hotfix/crash' into main")).toMatchObject({
      chip: { label: "merge", tone: "merge" },
      text: "hotfix/crash → main",
    });
    expect(parseSubject("Merge branch 'feature/x'").text).toBe("feature/x");
    expect(parseSubject("Merge remote-tracking branch 'origin/main' into dev").text).toBe("origin/main → dev");
    expect(parseSubject("Merge pull request #42 from octo/fix-login")).toMatchObject({
      text: "octo/fix-login",
      pr: "#42",
    });
    expect(parseSubject("Merge branch 'feat' into 'main'").text).toBe("feat → main");
    expect(parseSubject("Merge branches 'a' and 'b'")).toMatchObject({
      chip: { tone: "merge" },
      text: "branches 'a' and 'b'",
    });
    expect(parseSubject("Merge main into feature/theme")).toMatchObject({
      chip: { tone: "merge" },
      text: "main → feature/theme",
    });
  });

  it("marks reverts and fixup, squash and WIP commits", () => {
    expect(parseSubject('Revert "feat: glow"')).toMatchObject({ chip: { label: "revert" }, text: "feat: glow" });
    expect(parseSubject("fixup! feat: glow")).toMatchObject({ chip: { label: "fixup!", tone: "wip" } });
    expect(parseSubject("WIP: half done")).toMatchObject({ chip: { label: "wip" }, text: "half done" });
  });
});
