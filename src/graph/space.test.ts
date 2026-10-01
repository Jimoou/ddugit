import { describe, expect, it } from "vitest";
import { skyAngle } from "./space";

describe("skyAngle", () => {
  it("turns slowly while animating, holds still otherwise, and ignores long gaps", () => {
    const a0 = skyAngle(100, true);
    const a1 = skyAngle(100.1, true);
    expect(a1 - a0).toBeCloseTo((0.1 * Math.PI * 2) / 600, 8);
    expect(skyAngle(100.2, false)).toBe(a1);
    // A background tab resuming after a minute moves at most one short step.
    expect(skyAngle(162, true) - a1).toBeLessThanOrEqual(0.25 * ((Math.PI * 2) / 600) + 1e-12);
  });
});
