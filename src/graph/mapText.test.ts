import { describe, expect, it } from "vitest";
import { textScale, ZOOM_TEXT_MAX } from "./mapText";

describe("map text scale", () => {
  it("keeps its size zoomed out and grows slower than the map zoomed in", () => {
    for (const k of [0.08, 0.3, 0.6, 1]) expect(textScale(k, "normal")).toBe(1);
    expect(textScale(2, "normal")).toBeCloseTo(Math.SQRT2, 1);
    expect(textScale(2, "normal")).toBeLessThan(2);
    expect(textScale(1.5, "normal")).toBeLessThan(textScale(2, "normal"));
    expect(textScale(3, "normal")).toBeCloseTo(ZOOM_TEXT_MAX, 1);
  });

  it("scales every zoom level by the reader's size", () => {
    expect(textScale(0.5, "small")).toBeLessThan(1);
    expect(textScale(0.5, "large")).toBeGreaterThan(1);
    expect(textScale(3, "large")).toBeGreaterThan(textScale(3, "normal"));
  });

  it("moves in sixteenths, so a zoom measures labels at a few sizes", () => {
    const sizes = new Set(Array.from({ length: 200 }, (_, i) => textScale(1 + i / 100, "normal")));
    expect(sizes.size).toBeLessThanOrEqual(11);
    for (const t of sizes) expect(t * 16).toBe(Math.round(t * 16));
  });
});
