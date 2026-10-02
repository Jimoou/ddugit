import { describe, expect, it } from "vitest";
import { clampView, KEEP, turnBounds } from "./camera";

const b = { left: 0, right: 1000, top: 0, bottom: 200 };

describe("clampView", () => {
  it("leaves a view showing the graph alone", () => {
    const v = { k: 1, tx: -100, ty: 50, r: 0 as const };
    expect(clampView(v, b, 800, 600)).toBe(v);
  });
  it("stops panning once only KEEP px of the graph would remain", () => {
    // Dragged far left: the graph's right edge would be off screen.
    expect(clampView({ k: 1, tx: -5000, ty: 0, r: 0 }, b, 800, 600).tx).toBe(KEEP - 1000);
    // Dragged far right: the left edge may come in to KEEP px from the right side.
    expect(clampView({ k: 1, tx: 5000, ty: 0, r: 0 }, b, 800, 600).tx).toBe(800 - KEEP);
    // And vertically, scaled by zoom.
    expect(clampView({ k: 0.5, tx: 0, ty: -3000, r: 0 }, b, 800, 600).ty).toBe(KEEP - 100);
  });
  it("keeps less than KEEP on a small viewport", () => {
    expect(clampView({ k: 1, tx: 5000, ty: 0, r: 0 }, b, 300, 300).tx).toBe(200);
  });
  it("keeps a turned graph on screen along its turned axes", () => {
    // Turned a quarter: the 1000 px of history run down the screen (world x → screen y).
    const t = turnBounds(b, 1);
    expect([t.left, t.right + 0, t.top, t.bottom]).toEqual([-200, 0, 0, 1000]);
    expect(clampView({ k: 1, tx: 0, ty: -5000, r: 1 }, b, 800, 600).ty).toBe(KEEP - 1000);
    // History running up from the bottom: its far end sits at y = -1000.
    expect(clampView({ k: 1, tx: 0, ty: 9000, r: 3 }, b, 800, 600).ty).toBe(600 - KEEP + 1000);
  });
});
