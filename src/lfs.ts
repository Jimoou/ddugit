// Git LFS pointers in diffs: a file routed through LFS is stored as a small
// text pointer (`version` / `oid` / `size`), so its diff is three lines of
// hashes. Read them back into "which object, how big" instead.

import type { FileDiff } from "./types";

export interface LfsPointer {
  /** sha256 of the content. */
  oid: string;
  /** Bytes. */
  size: number;
}

const SPEC = "version https://git-lfs.github.com/spec/v1";

/** A pointer file's text → the object it stands for; anything else → null. */
export function parsePointer(text: string): LfsPointer | null {
  const lines = text.split("\n").map((l) => l.trim());
  if (lines[0] !== SPEC) return null;
  const oid = lines.find((l) => l.startsWith("oid sha256:"))?.slice("oid sha256:".length);
  const size = Number(lines.find((l) => l.startsWith("size "))?.slice(5));
  return oid && Number.isFinite(size) ? { oid, size } : null;
}

/** Before / after objects when the diff is of LFS pointers (one side may not exist). */
export function lfsChange(file: FileDiff): { before: LfsPointer | null; after: LfsPointer | null } | null {
  const lines = file.hunks.flatMap((h) => h.lines);
  const side = (keep: string) =>
    lines
      .filter((l) => l.kind === " " || l.kind === keep)
      .map((l) => l.text)
      .join("\n");
  const before = parsePointer(side("-"));
  const after = parsePointer(side("+"));
  return before || after ? { before, after } : null;
}

/** 1536 → "1.5 KB". */
export function fmtBytes(n: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`;
}
