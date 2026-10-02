import { describe, expect, it } from "vitest";
import { chromeOf } from "./chrome";

describe("chromeOf", () => {
  it("draws its own frame only in the desktop app on macOS and Windows", () => {
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
    const win = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Edg/129.0";
    const linux = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15";
    expect(chromeOf(mac, true)).toBe("mac");
    expect(chromeOf(win, true)).toBe("win");
    expect(chromeOf(linux, true)).toBe("native");
    expect(chromeOf(win, false)).toBe("native");
  });
});
