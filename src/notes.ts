// Release notes from the commits between two releases (`release_range`):
// each commit becomes one line, grouped by its Conventional Commits type, with
// its pull request number (squash `(#12)`, GitHub "Merge pull request #12",
// GitLab "See merge request !12") and author, written as Markdown.

import type { NoteCommit } from "./types";

export const NOTE_KINDS = ["breaking", "feat", "fix", "perf", "refactor", "docs", "other"] as const;
export type NoteKind = (typeof NOTE_KINDS)[number];

export interface NoteItem {
  id: string;
  kind: NoteKind;
  scope: string | null;
  text: string;
  /** `#12` (GitHub style) or `!12` (GitLab merge request). */
  pr: string | null;
  author: string;
}

const KIND: Record<string, NoteKind> = {
  feat: "feat",
  feature: "feat",
  fix: "fix",
  perf: "perf",
  refactor: "refactor",
  docs: "docs",
};

/** One commit as a release-note line; null for a plain branch merge (its own commits say more, `noteItems`). */
export function noteItem(c: NoteCommit): NoteItem | null {
  const bodyLine =
    c.body
      .split("\n")
      .find((l) => l.trim())
      ?.trim() ?? "";
  let text = c.summary.trim();
  let pr: string | null = null;
  const ghMerge = /^Merge pull request #(\d+) from \S+/.exec(text);
  const glMerge = /See merge request \S*!(\d+)/.exec(c.body);
  if (ghMerge) {
    pr = `#${ghMerge[1]}`;
    text = bodyLine || text;
  } else if (/^Merge branch '[^']+' into '[^']+'/.test(text) && glMerge) {
    pr = `!${glMerge[1]}`;
    text = bodyLine || text;
  } else if (/^Merge (remote-tracking )?branch /.test(text)) {
    return null;
  }
  const squashed = /\s*\((#\d+|!\d+)\)$/.exec(text);
  if (squashed) {
    pr ??= squashed[1];
    text = text.slice(0, squashed.index);
  }
  const cc = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/.exec(text);
  const breaking = !!cc?.[3] || /^BREAKING[ -]CHANGE:/m.test(c.body);
  const kind: NoteKind = breaking ? "breaking" : (KIND[cc?.[1].toLowerCase() ?? ""] ?? "other");
  return { id: c.id, kind, scope: cc?.[2]?.trim() || null, text: cc ? cc[4] : text, pr, author: c.author };
}

/** Every line of a release: a pull request merge is one line; a plain branch merge gives the commits it brought in. */
export function noteItems(commits: NoteCommit[]): NoteItem[] {
  return commits.flatMap((c) => {
    const item = noteItem(c);
    if (item) return [item];
    return c.inner.map(noteItem).filter((i): i is NoteItem => !!i);
  });
}

export interface ForgeWeb {
  /** `https://host/owner/repo` */
  base: string;
  kind: "github" | "gitlab";
}

/** The web page of a GitHub / GitLab remote (`https://…`, `git@host:…`, `ssh://…`); null for anything else. */
export function forgeWeb(url: string | null | undefined): ForgeWeb | null {
  if (!url) return null;
  const m = /^(?:[a-z+]+:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/|[^@/]+@([^:/]+):)(.+?)(?:\.git)?\/?$/i.exec(url.trim());
  if (!m) return null;
  const host = (m[1] ?? m[2]).toLowerCase();
  const kind = host === "github.com" ? "github" : host.includes("gitlab") ? "gitlab" : null;
  return kind && m[3].includes("/") ? { base: `https://${host}/${m[3]}`, kind } : null;
}

function refLink(item: NoteItem, web: ForgeWeb | null): string {
  if (item.pr) {
    const n = item.pr.slice(1);
    if (!web) return item.pr;
    const path = item.pr.startsWith("!") || web.kind === "gitlab" ? `-/merge_requests/${n}` : `pull/${n}`;
    return `[${item.pr}](${web.base}/${path})`;
  }
  const short = item.id.slice(0, 7);
  return web ? `[${short}](${web.base}/${web.kind === "gitlab" ? "-/" : ""}commit/${item.id})` : short;
}

export interface NotesOptions {
  title: string;
  items: NoteItem[];
  /** Section headings, and `empty` for a release with nothing to say. */
  labels: Record<NoteKind | "empty", string>;
  web: ForgeWeb | null;
  /** Also list commits that aren't features, fixes, … (chores, CI, tests, untyped messages). */
  includeOther: boolean;
}

/** The release notes as Markdown: a heading, then a section per kind, oldest change first. */
export function releaseMarkdown(o: NotesOptions): string {
  const out = [`## ${o.title}`];
  let any = false;
  for (const kind of NOTE_KINDS) {
    if (kind === "other" && !o.includeOther) continue;
    // Commits come newest first; a changelog reads in the order things landed.
    const items = o.items.filter((i) => i.kind === kind).reverse();
    if (!items.length) continue;
    any = true;
    out.push("", `### ${o.labels[kind]}`, "");
    for (const i of items) {
      const scope = i.scope ? `**${i.scope}:** ` : "";
      out.push(`- ${scope}${i.text} (${refLink(i, o.web)}) — ${i.author}`);
    }
  }
  if (!any) out.push("", `_${o.labels.empty}_`);
  return out.join("\n") + "\n";
}
