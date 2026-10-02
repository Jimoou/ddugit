import { describe, expect, it } from "vitest";
import { complete, current, MISSIONS, NEW_VOYAGE, parseVoyage } from "./missions";

describe("tutorial voyage", () => {
  it("completes missions in any order and points at the first one left", () => {
    let v = complete(NEW_VOYAGE, "merge");
    expect(current(v)).toBe("inspect");
    v = complete(complete(v, "inspect"), "inspect");
    expect(v.done).toEqual(["inspect", "merge"]);
    expect(current(v)).toBe("commit");
    for (const m of MISSIONS) v = complete(v, m);
    expect(current(v)).toBeNull();
  });

  it("reads stored progress, dropping unknown missions and junk", () => {
    expect(parseVoyage('{"done":["push","warp","inspect"],"dismissed":true}')).toEqual({
      done: ["inspect", "push"],
      dismissed: true,
    });
    expect(parseVoyage("not json")).toEqual(NEW_VOYAGE);
    expect(parseVoyage(null)).toEqual(NEW_VOYAGE);
  });
});
