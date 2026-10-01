import { describe, expect, it } from "vitest";
import { groupOf, STALE_DAYS } from "./Cleanup";

const now = 1_800_000_000;
const b = (over: Partial<Parameters<typeof groupOf>[0]>) => ({
  name: "x",
  tip: "t",
  time: now,
  merged: false,
  gone: false,
  upstream: null,
  ...over,
});

describe("groupOf", () => {
  it("puts merged first, then gone, then stale, and leaves active branches out", () => {
    expect(groupOf(b({ merged: true, gone: true }), now)).toBe("merged");
    expect(groupOf(b({ gone: true, time: 0 }), now)).toBe("gone");
    expect(groupOf(b({ time: now - (STALE_DAYS + 1) * 86400 }), now)).toBe("stale");
    expect(groupOf(b({ time: now - 86400 }), now)).toBeNull();
  });
});
