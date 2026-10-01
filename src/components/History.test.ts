import { describe, expect, it } from "vitest";
import { ageColor } from "./History";

describe("ageColor", () => {
  it("runs from a red giant (oldest) to a blue star (newest)", () => {
    expect(ageColor(0, 0, 100)).toBe("rgb(255, 107, 107)");
    expect(ageColor(100, 0, 100)).toBe("rgb(140, 200, 255)");
    expect(ageColor(50, 0, 100)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
  });
  it("treats a single age as newest and clamps outside the range", () => {
    expect(ageColor(5, 5, 5)).toBe("rgb(140, 200, 255)");
    expect(ageColor(-10, 0, 100)).toBe(ageColor(0, 0, 100));
  });
});
