import { describe, expect, it } from "vitest";
import { planetLook } from "./planet";

describe("planetLook", () => {
  it("is the same planet for the same repository, and varies between them", () => {
    expect(planetLook("/work/rocket")).toEqual(planetLook("/work/rocket"));
    const hues = new Set(["/a", "/b", "/c", "/d", "/e", "/f"].map((p) => planetLook(p).hue));
    expect(hues.size).toBeGreaterThan(3);
    const l = planetLook("/work/rocket");
    expect(l.hue).toBeGreaterThanOrEqual(0);
    expect(l.hue).toBeLessThan(360);
    expect(l.bands).toBeLessThan(4);
  });
});
