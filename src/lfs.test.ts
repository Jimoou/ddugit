import { describe, expect, it } from "vitest";
import { fmtBytes, lfsChange, parsePointer } from "./lfs";
import type { DiffLine, FileDiff } from "./types";

const OID_A = "2c26b46b68ffc68ff99b453c1d30413413422d706483bfa0f98a5e886266e7ae";
const OID_B = "fcde2b2edba56bf408601fb721fe9b5c338d10ee429ea04fae5511b68fbf8fb9";
const l = (kind: DiffLine["kind"], text: string): DiffLine => ({ kind, old: null, new: null, text });
const file = (lines: DiffLine[]): FileDiff => ({
  path: "art/cover.psd",
  oldPath: null,
  status: "modified",
  additions: 0,
  deletions: 0,
  binary: false,
  truncated: false,
  hunks: [{ header: "@@", lines }],
});

describe("lfs", () => {
  it("reads a pointer and nothing else", () => {
    const text = `version https://git-lfs.github.com/spec/v1\noid sha256:${OID_A}\nsize 3\n`;
    expect(parsePointer(text)).toEqual({ oid: OID_A, size: 3 });
    expect(parsePointer("hello\nworld")).toBeNull();
  });

  it("turns a pointer diff into before / after objects", () => {
    const change = lfsChange(
      file([
        l(" ", "version https://git-lfs.github.com/spec/v1"),
        l("-", `oid sha256:${OID_A}`),
        l("-", "size 2048"),
        l("+", `oid sha256:${OID_B}`),
        l("+", "size 5242880"),
      ]),
    );
    expect(change).toEqual({ before: { oid: OID_A, size: 2048 }, after: { oid: OID_B, size: 5242880 } });
    // A new LFS file: nothing before.
    expect(
      lfsChange(
        file([l("+", "version https://git-lfs.github.com/spec/v1"), l("+", `oid sha256:${OID_A}`), l("+", "size 1")]),
      ),
    ).toEqual({ before: null, after: { oid: OID_A, size: 1 } });
    expect(lfsChange(file([l("+", "const x = 1;")]))).toBeNull();
  });

  it("formats sizes", () => {
    expect(fmtBytes(512)).toBe("512 B");
    expect(fmtBytes(1536)).toBe("1.5 KB");
    expect(fmtBytes(5242880)).toBe("5.0 MB");
    expect(fmtBytes(300 * 1024 * 1024)).toBe("300 MB");
  });
});
