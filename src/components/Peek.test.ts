import { describe, expect, it } from "vitest";
import { bodyPreview } from "./Peek";

describe("preview card body", () => {
  it("skips the summary and blank lines and keeps the first few", () => {
    expect(bodyPreview("Fix crash\n\nThe graph crashed when\n\n  empty.\nMore\nAnd more")).toEqual([
      "The graph crashed when",
      "empty.",
      "More",
    ]);
    expect(bodyPreview("Only a summary")).toEqual([]);
  });
});
