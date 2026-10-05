import { describe, expect, it } from "vitest";
import { FORGE_SOURCES, SOURCES, filterRepos, remoteNameFor, repoUrl } from "./forgeRepos";
import type { ForgeRepo } from "./types";

const r = (fullName: string, description: string | null = null): ForgeRepo => ({
  fullName,
  description,
  private: false,
  httpsUrl: `https://github.com/${fullName}.git`,
  sshUrl: `git@github.com:${fullName}.git`,
  updated: "",
});

describe("forge repository picker", () => {
  const list = [r("jimin/notes", "rocket launch log"), r("acme/site"), r("acme/rocket-docs"), r("jimin/rocket")];
  const names = (q: string) => filterRepos(list, q).map((x) => x.fullName);

  it("keeps the forge's order without a query", () => {
    expect(names("  ")).toEqual(list.map((x) => x.fullName));
  });

  it("ranks segment-start name matches, then name, then description", () => {
    expect(names("rocket")).toEqual(["acme/rocket-docs", "jimin/rocket", "jimin/notes"]);
    expect(names("ocket")).toEqual(["acme/rocket-docs", "jimin/rocket", "jimin/notes"]);
    expect(names("ROCK")).toEqual(["acme/rocket-docs", "jimin/rocket", "jimin/notes"]);
  });

  it("needs every word, in the name or description", () => {
    expect(names("acme rock")).toEqual(["acme/rocket-docs"]);
    expect(names("jimin launch")).toEqual(["jimin/notes"]);
    expect(names("nothing")).toEqual([]);
  });

  it("names a remote after the owner", () => {
    expect(remoteNameFor("Acme/site")).toBe("acme");
    expect(remoteNameFor("Big Group/sub/app")).toBe("big-group");
    expect(remoteNameFor(".../x")).toBe("upstream");
  });

  it("picks the URL for the protocol", () => {
    expect(repoUrl(list[1], "ssh")).toBe("git@github.com:acme/site.git");
    expect(repoUrl(list[1], "https")).toBe("https://github.com/acme/site.git");
  });

  it("lists URL first, then each forge once", () => {
    expect(SOURCES).toEqual(["url", "github", "gitlab"]);
    expect(new Set(FORGE_SOURCES.map((f) => f.host)).size).toBe(FORGE_SOURCES.length);
  });
});
