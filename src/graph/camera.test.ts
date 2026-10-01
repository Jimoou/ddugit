import { describe, expect, it } from "vitest";
import { clampView, KEEP } from "./camera";

const b = { left: 0, right: 1000, top: 0, bottom: 200 };

describe("clampView", () => {
  it("leaves a view showing the graph alone", () => {
    const v = { k: 1, tx: -100, ty: 50 };
    expect(clampView(v, b, 800, 600)).toBe(v);
  });
  it("stops panning once only KEEP px of the graph would remain", () => {
    // Dragged far left: the graph's right edge would be off screen.
    expect(clampView({ k: 1, tx: -5000, ty: 0 }, b, 800, 600).tx).toBe(KEEP - 1000);
    // Dragged far right: the left edge may come in to KEEP px from the right side.
    expect(clampView({ k: 1, tx: 5000, ty: 0 }, b, 800, 600).tx).toBe(800 - KEEP);
    // And vertically, scaled by zoom.
    expect(clampView({ k: 0.5, tx: 0, ty: -3000 }, b, 800, 600).ty).toBe(KEEP - 100);
  });
  it("keeps less than KEEP on a small viewport", () => {
    expect(clampView({ k: 1, tx: 5000, ty: 0 }, b, 300, 300).tx).toBe(200);
  });
});
