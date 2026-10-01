import { describe, expect, it } from "vitest";
import {
  forgetRecent,
  joinPath,
  nameFromUrl,
  parseRecent,
  RECENT_MAX,
  repoName,
  sortRecent,
  toggleStar,
  touchRecent,
} from "./recent";

describe("recent repositories", () => {
  it("parses stored lists and drops broken entries", () => {
    expect(parseRecent(null)).toEqual([]);
    expect(parseRecent("{oops")).toEqual([]);
    expect(
      parseRecent(JSON.stringify([{ path: "/a", at: 2 }, { path: 3 }, null, { path: "/b", starred: true }])),
    ).toEqual([
      { path: "/a", starred: false, at: 2 },
      { path: "/b", starred: true, at: 0 },
    ]);
  });

  it("moves a reopened repo to the front, keeps stars first and trims old ones", () => {
    let list = toggleStar(touchRecent([], "/star", 1), "/star");
    for (let i = 0; i < RECENT_MAX + 3; i++) list = touchRecent(list, `/r${i}`, 10 + i);
    expect(list).toHaveLength(RECENT_MAX + 1);
    expect(list[0].path).toBe("/star");
    expect(list[1].path).toBe(`/r${RECENT_MAX + 2}`);
    list = touchRecent(list, "/r5", 100);
    expect(list[1]).toEqual({ path: "/r5", starred: false, at: 100 });
    expect(list.filter((r) => r.path === "/r5")).toHaveLength(1);
    expect(sortRecent(forgetRecent(list, "/star"))[0].path).toBe("/r5");
  });

  it("names repositories from paths and URLs", () => {
    expect(repoName("/home/me/otgit/")).toBe("otgit");
    expect(repoName("C:\\work\\proj")).toBe("proj");
    expect(nameFromUrl("https://github.com/Jimoou/otgit.git")).toBe("otgit");
    expect(nameFromUrl("git@github.com:me/tool.git")).toBe("tool");
    expect(nameFromUrl("ssh://git@host:22/team/svc/")).toBe("svc");
    expect(nameFromUrl("")).toBe("");
    expect(joinPath("/home/me/", "otgit")).toBe("/home/me/otgit");
    expect(joinPath("C:\\work", "otgit")).toBe("C:\\work\\otgit");
  });
});
