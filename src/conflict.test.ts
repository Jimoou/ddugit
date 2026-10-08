import { describe, expect, it } from "vitest";
import { conflictCount, newerSide, parseConflicts, resolveText } from "./conflict";

const file = [
  "keep 1\n",
  "<<<<<<< HEAD\n",
  "main side\n",
  "=======\n",
  "feature side\n",
  ">>>>>>> feature\n",
  "keep 2\n",
  "<<<<<<< HEAD\n",
  "a\n",
  "||||||| base\n",
  "orig\n",
  "=======\n",
  "b\n",
  ">>>>>>> feature\n",
].join("");

describe("parseConflicts", () => {
  it("splits text and conflict blocks with labels and diff3 base", () => {
    const segs = parseConflicts(file);
    expect(conflictCount(segs)).toBe(2);
    expect(segs[0]).toEqual({ kind: "text", text: "keep 1\n" });
    expect(segs[1]).toMatchObject({
      kind: "conflict",
      ours: "main side\n",
      theirs: "feature side\n",
      base: null,
      oursLabel: "HEAD",
      theirsLabel: "feature",
    });
    expect(segs[3]).toMatchObject({ ours: "a\n", base: "orig\n", theirs: "b\n" });
  });

  it("returns a single text segment when there are no markers", () => {
    expect(parseConflicts("x\ny")).toEqual([{ kind: "text", text: "x\ny" }]);
  });

  it("leaves an unterminated block as plain text", () => {
    const segs = parseConflicts("a\n<<<<<<< HEAD\nb\n");
    expect(conflictCount(segs)).toBe(0);
    expect(resolveText(segs, [])).toBe("a\n<<<<<<< HEAD\nb\n");
  });
});

describe("resolveText", () => {
  it("applies one pick per block and keeps surrounding text byte for byte", () => {
    const segs = parseConflicts(file);
    expect(resolveText(segs, ["theirs", "ours"])).toBe("keep 1\nfeature side\nkeep 2\na\n");
    expect(resolveText(segs, ["both", "theirs"])).toBe("keep 1\nmain side\nfeature side\nkeep 2\nb\n");
  });

  it("keeps markers for blocks without a pick", () => {
    const out = resolveText(parseConflicts(file), ["ours"]);
    expect(out).toContain("<<<<<<< HEAD\na\n=======\nb\n>>>>>>> feature\n");
  });

  it("uses hand-edited text with the file's line ending and a trailing newline", () => {
    const segs = parseConflicts(file);
    expect(resolveText(segs, [{ text: "merged" }, "ours"])).toBe("keep 1\nmerged\nkeep 2\na\n");
    expect(resolveText(segs, [{ text: "" }, "ours"])).toBe("keep 1\nkeep 2\na\n");
    const crlf = parseConflicts("<<<<<<< HEAD\r\no\r\n=======\r\nt\r\n>>>>>>> f\r\n");
    expect(resolveText(crlf, [{ text: "x\ny\n" }])).toBe("x\r\ny\r\n");
  });

  it("handles CRLF files", () => {
    const crlf = "x\r\n<<<<<<< HEAD\r\no\r\n=======\r\nt\r\n>>>>>>> f\r\ny\r\n";
    expect(resolveText(parseConflicts(crlf), ["theirs"])).toBe("x\r\nt\r\ny\r\n");
  });
});

describe("newerSide", () => {
  it("names the side changed later, and neither on a tie or with a side unknown", () => {
    expect(newerSide({ time: 20 }, { time: 10 })).toBe("ours");
    expect(newerSide({ time: 10 }, { time: 20 })).toBe("theirs");
    expect(newerSide({ time: 10 }, { time: 10 })).toBeNull();
    expect(newerSide({ time: 10 }, null)).toBeNull();
  });
});
