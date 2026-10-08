// What kind of change a commit summary says it is, so the map can mark it at a glance:
// Conventional Commits types (`feat(graph): …`), merges, reverts, fixup/squash/WIP
// commits, and a trailing pull request number (`… (#123)`). Anything else is plain text.

/** A short mark drawn before a summary on the map. */
export interface SubjectChip {
  /** Text in the chip (the type, or a word for merges and the like). */
  label: string;
  /** Colour family, see `CHIP_COLOR` in the renderer. */
  tone: Tone;
}

export type Tone = "feat" | "fix" | "docs" | "perf" | "refactor" | "test" | "chore" | "merge" | "revert" | "wip";

export interface Subject {
  chip: SubjectChip | null;
  /** The summary without what the chip, `scope` and `pr` already say. */
  text: string;
  /** `graph` in `feat(graph): …`. */
  scope: string | null;
  /** `#123` from a trailing `(#123)` or a GitHub merge summary. */
  pr: string | null;
  /** `type!:`, a breaking change. */
  breaking: boolean;
}

const TONES: Record<string, Tone> = {
  feat: "feat",
  feature: "feat",
  fix: "fix",
  bugfix: "fix",
  hotfix: "fix",
  docs: "docs",
  doc: "docs",
  perf: "perf",
  refactor: "refactor",
  style: "refactor",
  test: "test",
  tests: "test",
  chore: "chore",
  build: "chore",
  ci: "chore",
  deps: "chore",
  release: "chore",
  revert: "revert",
};

const CONVENTIONAL = /^([a-z]+)(?:\(([^)\n]{1,40})\))?(!)?:\s+(.+)$/i;
const TRAILING_PR = /\s*\(#(\d+)\)$/;
const MERGE_PR = /^Merge pull request #(\d+) from (\S+)/;
/** `Merge branch 'a' into main`, GitLab's `into 'main'`, remote-tracking, or a bare `Merge a into b`. */
const MERGE = /^Merge (?:remote-tracking )?(?:branch )?'?([^'\s]+)'?(?: of \S+)?(?: into '?([^'\s]+)'?)?$/;
const REVERT = /^Revert "(.+)"$/;
const MARK = /^(fixup!|squash!|amend!|WIP:?)\s+(.+)$/i;

/** `summary` split into a chip, the rest of the text and a pull request number. */
export function parseSubject(summary: string): Subject {
  const line = summary.trim();
  let m = MERGE_PR.exec(line);
  if (m) return { chip: { label: "merge", tone: "merge" }, text: m[2], scope: null, pr: `#${m[1]}`, breaking: false };
  m = MERGE.exec(line);
  if (m) {
    const text = m[2] ? `${m[1]} → ${m[2]}` : m[1];
    return { chip: { label: "merge", tone: "merge" }, text, scope: null, pr: null, breaking: false };
  }
  if (/^Merge\b/.test(line)) return withPr({ label: "merge", tone: "merge" }, line.replace(/^Merge\s+/, ""), false);
  m = REVERT.exec(line);
  if (m) return withPr({ label: "revert", tone: "revert" }, m[1], false);
  m = MARK.exec(line);
  if (m) return withPr({ label: m[1].replace(/:$/, "").toLowerCase(), tone: "wip" }, m[2], false);
  m = CONVENTIONAL.exec(line);
  const tone = m && TONES[m[1].toLowerCase()];
  if (m && tone) return withPr({ label: m[1].toLowerCase(), tone }, m[4], !!m[3], m[2] ?? null);
  return withPr(null, line, false);
}

function withPr(chip: SubjectChip | null, text: string, breaking: boolean, scope: string | null = null): Subject {
  const m = TRAILING_PR.exec(text);
  return m
    ? { chip, text: text.slice(0, m.index), scope, pr: `#${m[1]}`, breaking }
    : { chip, text, scope, pr: null, breaking };
}
