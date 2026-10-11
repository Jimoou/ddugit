import { describe, expect, it } from "vitest";
import { INK } from "./ink";

/** WCAG relative luminance of `#rrggbb`. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

describe("INK", () => {
  it("keeps one lane colour per dark lane, so a branch keeps its place in the palette", () => {
    expect(INK.light.lanes).toHaveLength(INK.dark.lanes.length);
  });

  it("prints lane names and labels readably on paper", () => {
    // Branch badges are lane-coloured text on the white badge over the paper.
    for (const lane of INK.light.lanes) {
      expect(contrast(lane, INK.light.sky)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(lane, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    }
    for (const c of [...Object.values(INK.light.chip), ...Object.values(INK.light.pr), INK.light.alert])
      expect(contrast(c, "#ffffff")).toBeGreaterThanOrEqual(4.5);
  });
});
