import { describe, expect, it } from "vitest";
import { activeTab, addEmpty, closeTab, cycle, openIn, parseTabs, selectAt, serializeTabs } from "./tabs";

const one = parseTabs(null, "/a");

describe("tabs", () => {
  it("opens a path in its existing tab, the welcome tab, or a new one", () => {
    const two = openIn(one, "/b");
    expect(two.list.map((t) => t.path)).toEqual(["/a", "/b"]);
    expect(activeTab(two).path).toBe("/b");
    expect(activeTab(openIn(two, "/a")).path).toBe("/a");
    expect(openIn(two, "/a").list).toHaveLength(2);
    const welcome = addEmpty(two);
    const filled = openIn(welcome, "/c");
    expect(filled.list.map((t) => t.path)).toEqual(["/a", "/b", "/c"]);
    expect(filled.active).toBe(welcome.active);
  });

  it("closes to the neighbour and never leaves zero tabs", () => {
    const three = openIn(openIn(one, "/b"), "/c");
    const mid = selectAt(three, 1);
    expect(activeTab(closeTab(mid, mid.active)).path).toBe("/c");
    expect(activeTab(closeTab(three, three.active)).path).toBe("/b");
    expect(closeTab(three, three.list[0].id).active).toBe(three.active);
    const last = closeTab(one, one.active);
    expect(last.list).toEqual([{ id: last.active, path: null }]);
  });

  it("cycles with wrap-around and ignores out-of-range picks", () => {
    const three = openIn(openIn(one, "/b"), "/c");
    expect(activeTab(cycle(three, 1)).path).toBe("/a");
    expect(activeTab(cycle(selectAt(three, 0), -1)).path).toBe("/c");
    expect(selectAt(three, 7)).toBe(three);
  });

  it("round-trips through storage without welcome tabs", () => {
    const t = selectAt(addEmpty(openIn(one, "/b")), 0);
    const back = parseTabs(serializeTabs(t), null);
    expect(back.list.map((x) => x.path)).toEqual(["/a", "/b"]);
    expect(activeTab(back).path).toBe("/a");
    expect(parseTabs("{bad", null).list).toEqual([{ id: 1, path: null }]);
    expect(parseTabs(JSON.stringify({ paths: ["/x", "/x", 3], active: 9 }), null).list).toEqual([
      { id: 1, path: "/x" },
    ]);
  });
});
