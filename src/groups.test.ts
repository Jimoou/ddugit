import { describe, expect, it } from "vitest";
import {
  addGroup,
  assignGroup,
  bands,
  GROUP_HUES,
  moveGroup,
  nextHue,
  ownerOf,
  suggestGroup,
  parseGroups,
  removeGroup,
  updateGroup,
} from "./groups";
import { parseRecent, RECENT_MAX, touchRecent } from "./recent";

const repo = (path: string, group?: string) => ({ path, starred: false, at: 0, ...(group ? { group } : {}) });

describe("repository groups", () => {
  it("parses stored groups and drops broken or repeated ones", () => {
    expect(parseGroups(null)).toEqual([]);
    expect(parseGroups("[")).toEqual([]);
    expect(
      parseGroups(JSON.stringify([{ id: "a", name: "Pay" }, { id: "a", name: "dup" }, { name: "no id" }, null])),
    ).toEqual([{ id: "a", name: "Pay", hue: GROUP_HUES[0], collapsed: false }]);
  });

  it("adds, renames, recolours, folds and reorders", () => {
    let g = addGroup(addGroup([], "a", " Payments "), "b", "Client A");
    expect(g.map((x) => [x.name, x.hue])).toEqual([
      ["Payments", GROUP_HUES[0]],
      ["Client A", GROUP_HUES[1]],
    ]);
    g = updateGroup(g, "a", { name: "Pay", collapsed: true, hue: nextHue(g[0].hue) });
    expect(g[0]).toEqual({ id: "a", name: "Pay", hue: GROUP_HUES[1], collapsed: true });
    expect(nextHue(GROUP_HUES[GROUP_HUES.length - 1])).toBe(GROUP_HUES[0]);
    expect(moveGroup(g, "b", -1).map((x) => x.id)).toEqual(["b", "a"]);
    expect(moveGroup(g, "b", 5).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("puts repositories in one group at a time and lays out bands", () => {
    const groups = addGroup(addGroup([], "a", "A"), "b", "B");
    let list = [repo("/1"), repo("/2"), repo("/3", "ghost")];
    list = assignGroup(list, ["/1", "/2"], "a");
    list = assignGroup(list, ["/2"], "b");
    expect(list.map((r) => r.group)).toEqual(["a", "b", "ghost"]);
    expect(assignGroup(list, ["/1"], null)[0]).toEqual(repo("/1"));

    const laid = bands(addGroup(groups, "c", "Empty"), list);
    expect(laid.map((b) => [b.group?.id ?? null, b.repos.map((r) => r.path)])).toEqual([
      ["a", ["/1"]],
      ["b", ["/2"]],
      ["c", []],
      [null, ["/3"]], // its group is gone
    ]);

    const after = removeGroup(groups, list, "a");
    expect(after.groups.map((x) => x.id)).toEqual(["b"]);
    expect(after.list[0]).toEqual(repo("/1"));
  });

  it("keeps the group through reopening, storage and trimming", () => {
    let list = assignGroup(touchRecent([], "/kept", 1), ["/kept"], "a");
    for (let i = 0; i < RECENT_MAX + 2; i++) list = touchRecent(list, `/r${i}`, 10 + i);
    expect(list.find((r) => r.path === "/kept")?.group).toBe("a");
    list = touchRecent(list, "/kept", 100);
    expect(list.find((r) => r.path === "/kept")).toEqual({ path: "/kept", starred: false, at: 100, group: "a" });
    expect(parseRecent(JSON.stringify(list)).find((r) => r.path === "/kept")?.group).toBe("a");
  });
});

describe("grouping suggestions", () => {
  it("reads the owner from forge URLs", () => {
    expect(ownerOf("https://github.com/Acme/api.git")).toEqual({ host: "github.com", owner: "Acme" });
    expect(ownerOf("git@gitlab.example.com:team/sub/x.git")).toEqual({ host: "gitlab.example.com", owner: "team" });
    expect(ownerOf("ssh://git@host:2222/org/x")).toEqual({ host: "host", owner: "org" });
    expect(ownerOf("/srv/repos/x.git")).toBeNull();
    expect(ownerOf(null)).toBeNull();
  });

  it("offers the biggest same-owner or same-folder set of ungrouped repositories", () => {
    const list = ["/w/a", "/w/b", "/w/c", "/x/d", "/y/e"].map((p) => repo(p));
    const origins = new Map<string, string | null>([
      ["/w/a", "https://github.com/acme/a.git"],
      ["/x/d", "git@github.com:acme/d.git"],
      ["/w/b", "https://github.com/me/b.git"],
    ]);
    // The /w folder (3) beats acme (2).
    expect(suggestGroup(list, origins, [], [])).toEqual({ key: "dir:/w", name: "w", paths: ["/w/a", "/w/b", "/w/c"] });
    expect(suggestGroup(list, origins, [], ["dir:/w"])).toEqual({
      key: "owner:github.com/acme",
      name: "acme",
      paths: ["/w/a", "/x/d"],
    });
    // Already grouped ones aren't offered; a set of every loose repository isn't either.
    const groups = addGroup([], "g", "G");
    expect(suggestGroup(assignGroup(list, ["/w/a", "/w/b", "/w/c"], "g"), origins, groups, [])).toBeNull();
    expect(suggestGroup([repo("/w/a"), repo("/w/b")], origins, [], [])).toBeNull();
  });
});
