import { describe, expect, it } from "vitest";
import { isTypingTarget } from "./keys";

const el = (tagName: string, isContentEditable = false) => ({ tagName, isContentEditable }) as unknown as EventTarget;

describe("isTypingTarget", () => {
  it("is true for fields, selects and editable content", () => {
    expect(isTypingTarget(el("INPUT"))).toBe(true);
    expect(isTypingTarget(el("TEXTAREA"))).toBe(true);
    expect(isTypingTarget(el("SELECT"))).toBe(true);
    expect(isTypingTarget(el("DIV", true))).toBe(true);
  });

  it("is false for everything else", () => {
    expect(isTypingTarget(el("BODY"))).toBe(false);
    expect(isTypingTarget(el("CANVAS"))).toBe(false);
    expect(isTypingTarget(el("BUTTON"))).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});
