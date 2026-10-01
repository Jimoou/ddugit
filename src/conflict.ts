// Conflict-marker parsing for the resolution view. Pure, so it is unit-tested.

export type Segment =
  | { kind: "text"; text: string }
  | { kind: "conflict"; ours: string; theirs: string; base: string | null; oursLabel: string; theirsLabel: string };

type Conflict = Extract<Segment, { kind: "conflict" }>;

/** How one block is resolved: one side, both, or hand-edited text. */
export type Pick = "ours" | "theirs" | "both" | { text: string };

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
  return segments.map((s) => (s.kind === "text" ? s.text : blockText(s, picks[n++]))).join("");
}

/** Text one block resolves to. */
export function blockText(s: Conflict, pick: Pick | undefined): string {
  if (pick === "ours") return s.ours;
  if (pick === "theirs") return s.theirs;
  if (pick === "both") return s.ours + s.theirs;
  if (pick) return edited(s, pick.text);
  return `<<<<<<< ${s.oursLabel}\n${s.ours}=======\n${s.theirs}>>>>>>> ${s.theirsLabel}\n`;
}

/**
 * Hand-edited text uses the block's line ending (textareas always give "\n")
 * and ends with a newline so it never runs into the following line.
 */
function edited(s: Conflict, text: string): string {
  const eol = /\r\n/.test(s.ours + s.theirs) ? "\r\n" : "\n";
  const t = text.replace(/\r?\n/g, eol);
  return t && !t.endsWith("\n") ? t + eol : t;
}

export const conflictCount = (segments: Segment[]) => segments.filter((s) => s.kind === "conflict").length;
