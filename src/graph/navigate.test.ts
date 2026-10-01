import { describe, expect, it } from "vitest";
import type { CommitInfo, RefInfo } from "../types";
import { computeLayout } from "./layout";
import { stepFrom } from "./navigate";

const c = (id: string, ...parents: string[]): CommitInfo => ({
  id,
  parents,
  summary: id,
  message: id,
  author: "a",
  email: "a@a",
  time: 0,
});
const local = (name: string, target: string): RefInfo => ({ name, kind: "local", target });

//   m (merge) ← main
//   | \
//   x  f2 ← feature
//   |  f1
//   | /
//   a
const layout = computeLayout(
  [c("m", "x", "f2"), c("f2", "f1"), c("x", "a"), c("f1", "a"), c("a")],
  [local("main", "m"), local("feature", "f2")],
  { branch: "main", target: "m" },
);

describe("stepFrom", () => {
  it("walks first parents and children along the same line", () => {
    expect(stepFrom(layout, "m", "older")).toBe("x");
    expect(stepFrom(layout, "x", "older")).toBe("a");
    expect(stepFrom(layout, "a", "older")).toBeNull();
    expect(stepFrom(layout, "a", "newer")).toBe("x"); // trunk child preferred over f1
    expect(stepFrom(layout, "f1", "newer")).toBe("f2");
    expect(stepFrom(layout, "m", "newer")).toBeNull();
  });
  it("jumps to the nearest commit in the next lane", () => {
    expect(stepFrom(layout, "x", "down")).toMatch(/^f[12]$/);
    expect(stepFrom(layout, "f2", "up")).toMatch(/^(m|x)$/);
    expect(stepFrom(layout, "m", "up")).toBeNull();
    expect(stepFrom(layout, "nope", "older")).toBeNull();
  });
});
