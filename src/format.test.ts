import { describe, expect, it } from "vitest";
import { setLocale } from "./i18n";
import { fmtAgo } from "./format";

describe("fmtAgo", () => {
  it("says how long ago in the largest whole unit", () => {
    setLocale("en");
    const now = 1_800_000_000 * 1000;
    const at = (secondsAgo: number) => fmtAgo(now / 1000 - secondsAgo, now);
    expect(at(10)).toBe("now");
    expect(at(5 * 60)).toBe("5 minutes ago");
    expect(at(3 * 86400)).toBe("3 days ago");
    expect(at(86400)).toBe("yesterday");
    expect(at(400 * 86400)).toBe("last year");
  });
});
