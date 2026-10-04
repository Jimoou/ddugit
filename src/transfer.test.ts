import { describe, expect, it } from "vitest";
import { guessName } from "./transfer";

describe("guessName", () => {
  it("takes the destination out of a ddugit bundle name, even with dashes in the repository", () => {
    expect(guessName("/in/my-app-acme-corp-2026-10-04-093015.bundle", "/src/my-app")).toBe("acme-corp");
    expect(guessName("C:\\in\\my-app-acme-2026-10-04-093015.bundle", "C:\\src\\my-app\\")).toBe("acme");
  });
  it("keeps any other name whole", () => {
    expect(guessName("/in/release.bundle", "/src/my-app")).toBe("release");
    expect(guessName("/in/.bundle", "/src/my-app")).toBe("bundle");
  });
});
