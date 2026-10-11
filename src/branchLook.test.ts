import { describe, expect, it } from "vitest";
import { EMPTY_LOOK, parseLooks, refKey, withColor, withHidden } from "./branchLook";

describe("branch look", () => {
  it("reads what was stored and leaves out anything malformed", () => {
    expect(parseLooks(null)).toEqual({});
    expect(parseLooks("not json")).toEqual({});
    expect(parseLooks("[]")).toEqual({});
    const raw = JSON.stringify({
      "/a": { colors: { feature: "#ff8800", bad: "red", short: "#f80", num: 3 }, hidden: ["local:x", "local:x", 4] },
      "/b": null,
      "/c": { colors: [], hidden: "local:y" },
    });
    expect(parseLooks(raw)).toEqual({
      "/a": { colors: { feature: "#ff8800" }, hidden: ["local:x"] },
      "/c": { colors: {}, hidden: [] },
    });
  });

  it("sets and clears a colour, hides and shows refs", () => {
    const red = withColor(EMPTY_LOOK, "feature", "#e5485f");
    expect(red.colors).toEqual({ feature: "#e5485f" });
    expect(withColor(red, "feature", null).colors).toEqual({});
    const key = refKey({ kind: "local", name: "feature" });
    const hidden = withHidden(EMPTY_LOOK, [key, "remote:origin/feature"], true);
    expect(hidden.hidden).toEqual(["local:feature", "remote:origin/feature"]);
    expect(withHidden(hidden, [key], true).hidden).toHaveLength(2);
    expect(withHidden(hidden, [key], false).hidden).toEqual(["remote:origin/feature"]);
  });
});
