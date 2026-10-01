// Conflict-marker parsing for the resolution view. Pure, so it is unit-tested.

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "conflict"; ours: string; theirs: string; base: string | null; oursLabel: string; theirsLabel: string };

export type Pick = "ours" | "theirs" | "both";

/**
 * Split a file with `<<<<<<<` / `=======` / `>>>>>>>` markers (and diff3's
 * `|||||||` base section) into plain text and conflict blocks. Line endings are
 * kept so `resolveText` reproduces untouched text byte for byte.
 */
export function parseConflicts(text: string): Segment[] {
  const lines = text.split(/(?<=\n)/);
  const out: Segment[] = [];
  let plain = "";
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith("<<<<<<<")) {
      plain += line;
      i++;
      continue;
    }
    const block = { ours: "", base: null as string | null, theirs: "", oursLabel: label(line), theirsLabel: "" };
    let part: "ours" | "base" | "theirs" = "ours";
    let j = i + 1;
    for (; j < lines.length; j++) {
      const l = lines[j];
      if (l.startsWith("|||||||") && part === "ours") {
        part = "base";
        block.base = "";
      } else if (l.startsWith("=======") && part !== "theirs") part = "theirs";
      else if (l.startsWith(">>>>>>>") && part === "theirs") {
        block.theirsLabel = label(l);
        break;
      } else if (part === "base") block.base += l;
      else block[part] += l;
    }
    if (j >= lines.length) {
      // Unterminated block: treat the rest as plain text rather than guessing.
      plain += lines.slice(i).join("");
      break;
    }
    if (plain) out.push({ kind: "text", text: plain });
    plain = "";
    out.push({ kind: "conflict", ...block });
    i = j + 1;
  }
  if (plain) out.push({ kind: "text", text: plain });
  return out;
}

function label(markerLine: string): string {
  return markerLine.slice(7).trim();
}

/** Final text given one pick per conflict block (in order). Unpicked blocks keep their markers. */
export function resolveText(segments: Segment[], picks: (Pick | undefined)[]): string {
  let n = 0;
  return segments
    .map((s) => {
      if (s.kind === "text") return s.text;
      const pick = picks[n++];
      if (pick === "ours") return s.ours;
      if (pick === "theirs") return s.theirs;
      if (pick === "both") return s.ours + s.theirs;
      return `<<<<<<< ${s.oursLabel}\n${s.ours}=======\n${s.theirs}>>>>>>> ${s.theirsLabel}\n`;
    })
    .join("");
}

export const conflictCount = (segments: Segment[]) => segments.filter((s) => s.kind === "conflict").length;
