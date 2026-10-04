import { describe, expect, it } from "vitest";
import type { NoteCommit } from "./types";
import { forgeWeb, noteItem, noteItems, releaseMarkdown, type NoteKind } from "./notes";

const c = (summary: string, body = "", id = "abcdef1234567890"): NoteCommit => ({
  id,
  author: "Jimin",
  time: 0,
  summary,
  body,
  inner: [],
});

describe("noteItem", () => {
  it("reads the type, scope and pull request of squash and merge commits", () => {
    expect(noteItem(c("feat(api): add search (#12)"))).toMatchObject({
      kind: "feat",
      scope: "api",
      text: "add search",
      pr: "#12",
    });
    expect(noteItem(c("Merge pull request #4 from me/topic", "fix: handle empty input\n\nlonger"))).toMatchObject({
      kind: "fix",
      text: "handle empty input",
      pr: "#4",
    });
    expect(
      noteItem(c("Merge branch 'topic' into 'main'", "perf: faster graph\n\nSee merge request team/app!7")),
    ).toMatchObject({ kind: "perf", pr: "!7" });
  });
  it("puts breaking changes first and untyped messages under other; plain merges say nothing", () => {
    expect(noteItem(c("refactor!: drop the old API"))?.kind).toBe("breaking");
    expect(noteItem(c("fix: x", "BREAKING CHANGE: y"))?.kind).toBe("breaking");
    expect(noteItem(c("Update README"))).toMatchObject({ kind: "other", scope: null, text: "Update README" });
    expect(noteItem(c("Merge branch 'main' into topic"))).toBeNull();
  });
});

describe("noteItems", () => {
  it("expands a plain branch merge into the commits it brought in", () => {
    const merge = { ...c("Merge branch 'feature/login'"), inner: [c("feat: remember me"), c("fix: typo")] };
    expect(noteItems([merge, c("Merge pull request #4 from me/x", "feat: y")]).map((i) => [i.kind, i.text])).toEqual([
      ["feat", "remember me"],
      ["fix", "typo"],
      ["feat", "y"],
    ]);
  });
});

describe("forgeWeb", () => {
  it("knows GitHub and GitLab remotes in any URL form", () => {
    expect(forgeWeb("git@github.com:acme/app.git")).toEqual({ base: "https://github.com/acme/app", kind: "github" });
    expect(forgeWeb("https://gitlab.example.com/team/sub/app.git")).toEqual({
      base: "https://gitlab.example.com/team/sub/app",
      kind: "gitlab",
    });
    expect(forgeWeb("/srv/git/app")).toBeNull();
    expect(forgeWeb("https://example.com/a/b")).toBeNull();
  });
});

describe("releaseMarkdown", () => {
  const labels = {
    breaking: "Breaking",
    feat: "Features",
    fix: "Fixes",
    perf: "Perf",
    refactor: "Refactor",
    docs: "Docs",
    other: "Other",
    empty: "Nothing",
  } satisfies Record<NoteKind | "empty", string>;
  const items = [c("chore: bump", "", "3333333aaaa"), c("fix(ui): b (#2)"), c("feat: a (#1)")].map((x) => noteItem(x)!);

  it("groups by kind, oldest first, with links when the forge is known", () => {
    const md = releaseMarkdown({
      title: "v1.0.0",
      items,
      labels,
      web: forgeWeb("https://github.com/acme/app"),
      includeOther: true,
    });
    expect(md).toBe(
      [
        "## v1.0.0",
        "",
        "### Features",
        "",
        "- a ([#1](https://github.com/acme/app/pull/1)) — Jimin",
        "",
        "### Fixes",
        "",
        "- **ui:** b ([#2](https://github.com/acme/app/pull/2)) — Jimin",
        "",
        "### Other",
        "",
        "- bump ([3333333](https://github.com/acme/app/commit/3333333aaaa)) — Jimin",
        "",
      ].join("\n"),
    );
  });
  it("leaves other out on request and says so when nothing is left", () => {
    const md = releaseMarkdown({ title: "v1", items: items.slice(0, 1), labels, web: null, includeOther: false });
    expect(md).toBe("## v1\n\n_Nothing_\n");
  });
});
