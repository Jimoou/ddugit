import { describe, expect, it } from "vitest";
import { contrast, hexToHsv, hsvToHex, inkFor, isHex } from "./color";

describe("color", () => {
  it("goes between hex and HSV both ways", () => {
    expect(hsvToHex({ h: 0, s: 1, v: 1 })).toBe("#ff0000");
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe("#00ff00");
    expect(hsvToHex({ h: 0, s: 0, v: 0 })).toBe("#000000");
    for (const hex of ["#22e8ff", "#ff3df2", "#8c5900", "#808080"]) expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    expect(hexToHsv("#ffffff")).toEqual({ h: 0, s: 0, v: 1 });
  });

  it("tells a colour from anything else", () => {
    expect(isHex("#a1B2c3")).toBe(true);
    for (const v of ["#abc", "a1b2c3", "#a1b2c3ff", 3, null, "red"]) expect(isHex(v)).toBe(false);
  });

  it("keeps a chosen colour that reads, and shades one that doesn't until it does", () => {
    const night = { paper: false, sky: "#05040e" };
    const paper = { paper: true, sky: "#efe9de" };
    expect(inkFor("#22e8ff", night)).toBe("#22e8ff");
    expect(contrast(inkFor("#101018", night), night.sky)).toBeGreaterThanOrEqual(3);
    // A bright yellow is unreadable on paper: it is darkened to text strength.
    const yellow = inkFor("#ffe14d", paper);
    expect(contrast(yellow, paper.sky)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(yellow, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(inkFor("#1b1814", paper)).toBe("#1b1814");
  });
});
