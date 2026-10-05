import { describe, expect, it } from "vitest";
import { Lru } from "./lru";

describe("Lru", () => {
  it("drops the least recently used entry past its size", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    expect(c.get("a")).toBe(1); // "b" is now the oldest
    c.set("c", 3);
    expect(c.size).toBe(2);
    expect(c.get("b")).toBeUndefined();
    expect(c.get("a")).toBe(1);
    expect(c.get("c")).toBe(3);
  });

  it("setting a key again refreshes it", () => {
    const c = new Lru<string, number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.set("a", 10);
    c.set("c", 3);
    expect(c.get("a")).toBe(10);
    expect(c.get("b")).toBeUndefined();
  });

  it("deletes only the value it was given, if any", () => {
    const c = new Lru<string, number>(3);
    c.set("a", 1);
    c.delete("a", 2);
    expect(c.get("a")).toBe(1);
    c.delete("a", 1);
    expect(c.get("a")).toBeUndefined();
    c.set("b", 2);
    c.delete("b");
    expect(c.size).toBe(0);
  });
});
