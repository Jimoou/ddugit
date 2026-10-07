// The demo repository (an in-memory commit graph seeded with a small history), its made-up diffs, and the helpers every demo command answers with.

import type { Args, Command, Ret } from "../api";
import type {
  CommitInfo,
  FileChange,
  FileDiff,
  OpResult,
  OpStatus,
  RefInfo,
  ReflogEntry,
  RepoSnapshot,
  SubmoduleInfo,
} from "../types";

/** Where the demo repository "is" on disk. */
export const DEMO_ROOT = "/demo/ddugit-demo";

let seq = 0;
export const fakeId = () => {
  seq += 1;
  let h = (seq * 2654435761) >>> 0;
  let out = "";
  for (let i = 0; i < 5; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out;
};

export const AUTHORS = ["Jimin", "Seoyeon", "Hyunwoo", "Minji"];

/**
 * `head` while HEAD is detached: commits made there advance this pseudo-branch, which the
 * snapshot doesn't list (it only keeps its commits in the history, like git's HEAD).
 */
const DETACHED = "HEAD";

class MockRepo {
  commits = new Map<string, CommitInfo>();
  order: string[] = []; // newest first
  branches = new Map<string, string>();
  remotes = new Map<string, string>();
  tags = new Map<string, string>();
  /** Tags on the remotes, as `<remote>/<tag>` → commit (git keeps no local copy; the demo has to). */
  remoteTags = new Map<string, string>();
  #head = "main";
  /** The checked-out branch, or `DETACHED`. Switching to a branch forgets the detached HEAD. */
  get head() {
    return this.#head;
  }
  set head(name: string) {
    if (name !== DETACHED) this.branches.delete(DETACHED);
    this.#head = name;
  }
  get detached() {
    return this.#head === DETACHED;
  }
  /** Check out commit `id` without a branch. */
  detach(id: string) {
    this.branches.set(DETACHED, id);
    this.#head = DETACHED;
  }
  changes: FileChange[] = [];
  state = "clean";
  clock = Math.floor(Date.now() / 1000) - 86400 * 40;
  fetched = false;
  /**
   * In-progress demo merge, cherry-pick, revert or rebase (or a conflicted stash pop): source commit, the
   * conflicted files' marked-up text, and what "continue" finishes with: a pick or revert's commit summary,
   * a rebase's tip.
   */
  pending: { source: string; label: string; files: Map<string, string>; summary?: string; tip?: string } | null = null;
  stashes: { message: string; id: string; base: string; time: number; changes: FileChange[] }[] = [];
  /** Lines of the top-level `.gitignore` (none at first). */
  gitignore: string[] = [];
  /** Target branch → commits ignored for it. */
  backportIgnored = new Map<string, Set<string>>();
  remoteUrls = new Map([["origin", "https://github.com/ddugit/ddugit-demo.git"]]);
  /** Remotes nothing is pushed to (the original project of a fork). */
  fetchOnly = new Set<string>();
  /** Branches following something other than `origin/<same name>`. */
  tracking = new Map<string, string>();
  /** Commits a stopped (empty) backport still has to apply after a skip. */
  skipRest: string[] = [];
  /** Demo bisect (HEAD isn't moved; the probe is reported in the state instead). */
  bisect: { bad: string; good: string[]; skipped: string[] } | null = null;
  /** Submodules: one in place, one not checked out yet (like a clone without --recursive). */
  submodules: SubmoduleInfo[] = [
    {
      name: "vendor/stardust",
      path: "vendor/stardust",
      url: "https://github.com/ddugit/stardust.git",
      recorded: "5d1c0a7e3b9f42c1a8e6d0b7f3c2a9e1d4b6c8f0",
      checkedOut: "5d1c0a7e3b9f42c1a8e6d0b7f3c2a9e1d4b6c8f0",
      state: "clean",
    },
    {
      name: "libs/orbit-math",
      path: "libs/orbit-math",
      url: "https://github.com/ddugit/orbit-math.git",
      recorded: "a3f9e2b4c6d8e0f1a2b3c4d5e6f708192a3b4c5d",
      checkedOut: null,
      state: "uninitialized",
    },
  ];
  /** Linked worktrees (the demo's own folder is the main one). */
  worktrees: { path: string; branch: string }[] = [];
  /** Where HEAD has been, newest first (like `git reflog`); `lost` is computed on read. */
  reflog: Omit<ReflogEntry, "lost">[] = [];

  /** Record a HEAD move after a command, if the tip changed. */
  noteHead(message: string) {
    const tip = this.branches.get(this.head);
    const last = this.reflog[0]?.id ?? "0".repeat(40);
    if (!tip || tip === last) return;
    const c = this.commits.get(tip)!;
    this.reflog.unshift({ id: tip, prev: last, message, summary: c.summary, time: Math.floor(Date.now() / 1000) });
  }

  commit(parents: string[], summary: string, author = AUTHORS[seq % AUTHORS.length]): string {
    const id = fakeId();
    this.clock += 3600 * (2 + (seq % 7));
    this.commits.set(id, {
      id,
      parents,
      summary,
      message: summary + "\n",
      author,
      email: `${author.toLowerCase()}@ddugit.dev`,
      time: this.clock,
    });
    this.order.unshift(id);
    return id;
  }

  /** Branch, remote branch, tag or commit id → commit id. */
  resolve(name: string): string | undefined {
    return this.branches.get(name) ?? this.remotes.get(name) ?? this.tags.get(name) ?? this.commits.get(name)?.id;
  }

  /** Every commit reachable from `id`. */
  reach(id: string | undefined): Set<string> {
    const seen = new Set<string>();
    const stack = id ? [id] : [];
    while (stack.length) {
      const c = stack.pop()!;
      if (seen.has(c)) continue;
      seen.add(c);
      stack.push(...(this.commits.get(c)?.parents ?? []));
    }
    return seen;
  }

  /** Commit on top of `branch` and advance it. */
  add(branch: string, summary: string, extraParents: string[] = []): string {
    const tip = this.branches.get(branch);
    const id = this.commit([...(tip ? [tip] : []), ...extraParents], summary);
    this.branches.set(branch, id);
    return id;
  }

  branch(name: string, from: string) {
    this.branches.set(name, this.branches.get(from)!);
  }

  merge(source: string, target: string, summary?: string) {
    const src = this.branches.get(source) ?? this.remotes.get(source) ?? source;
    return this.add(target, summary ?? `Merge branch '${source}' into ${target}`, [src]);
  }

  ancestors(id: string): Set<string> {
    const out = new Set<string>();
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop()!;
      if (out.has(cur) || !this.commits.has(cur)) continue;
      out.add(cur);
      stack.push(...this.commits.get(cur)!.parents);
    }
    return out;
  }

  upstream(): string | null {
    const name = this.tracking.get(this.head) ?? `origin/${this.head}`;
    return this.remotes.has(name) ? name : null;
  }

  aheadBehind(): [number, number] {
    const up = this.upstream();
    const local = this.branches.get(this.head);
    if (!up || !local) return [0, 0];
    const a = this.ancestors(local);
    const b = this.ancestors(this.remotes.get(up)!);
    return [[...a].filter((x) => !b.has(x)).length, [...b].filter((x) => !a.has(x)).length];
  }

  snapshot(limit = Infinity): RepoSnapshot {
    const refs: RefInfo[] = [
      ...[...this.branches]
        .filter(([name]) => name !== DETACHED)
        .map(([name, target]) => ({ name, kind: "local" as const, target })),
      ...[...this.remotes].map(([name, target]) => ({ name, kind: "remote" as const, target })),
      ...[...this.tags].map(([name, target]) => ({ name, kind: "tag" as const, target })),
    ];
    const [ahead, behind] = this.aheadBehind();
    // Like git, only list commits reachable from a ref (rebased-away ones vanish).
    const reachable = new Set<string>();
    const stack = [...refs.map((r) => r.target), ...(this.detached ? [this.branches.get(DETACHED)!] : [])];
    while (stack.length) {
      const id = stack.pop()!;
      if (reachable.has(id) || !this.commits.has(id)) continue;
      reachable.add(id);
      stack.push(...this.commits.get(id)!.parents);
    }
    const all = this.order.filter((id) => reachable.has(id));
    return {
      path: DEMO_ROOT,
      name: "ddugit-demo",
      head: {
        branch: this.detached ? null : this.head,
        target: this.branches.get(this.head) ?? null,
        upstream: this.upstream(),
        ahead,
        behind,
      },
      commits: all.slice(0, limit).map((id) => this.commits.get(id)!),
      refs,
      remotes: [...this.remoteUrls].map(([name, url]) => ({ name, url, push: !this.fetchOnly.has(name) })),
      changes: this.changes.map((c) => ({ ...c })),
      stashes: this.stashes.map(({ message, id, base, time }, index) => ({ index, message, id, base, time })),
      state: this.state,
      incoming: this.pending?.source ?? null,
      truncated: all.length > limit,
      worktrees: [
        { path: DEMO_ROOT, branch: this.head, main: true, current: true },
        ...this.worktrees.map((w) => ({ ...w, main: false, current: false })),
      ].map((w) => ({
        ...w,
        branch: w.branch === DETACHED ? null : w.branch,
        head: this.branches.get(w.branch) ?? null,
        locked: false,
        missing: false,
      })),
      submodules: this.submodules.map((m) => ({ ...m })),
    };
  }
}

function seed(): MockRepo {
  const r = new MockRepo();
  r.add("main", "Initial commit");
  r.add("main", "Add project skeleton");
  r.add("main", "Set up CI pipeline");
  r.tags.set("v0.1.0", r.branches.get("main")!);

  r.branch("feature/login", "main");
  r.add("feature/login", "Login form UI");
  r.add("main", "Fix typo in README");
  r.add("feature/login", "Hook up auth API");
  r.branch("feature/theme", "main");
  r.add("feature/theme", "Neon theme tokens");
  r.add("feature/login", "Remember-me checkbox");
  r.merge("feature/login", "main");
  r.add("feature/theme", "Glow shader for edges");
  r.add("main", "Bump dependencies");
  r.branch("hotfix/crash", "main");
  r.add("hotfix/crash", "Fix crash on empty repo");
  r.merge("hotfix/crash", "main");
  r.tags.set("v0.2.0", r.branches.get("main")!);
  for (const [tag, id] of r.tags) r.remoteTags.set(`origin/${tag}`, id);
  r.add("feature/theme", "Sparkle particles");
  r.merge("main", "feature/theme", "Merge main into feature/theme");
  r.add("feature/theme", "Tune particle speed");
  r.branch("feature/graph-zoom", "main");
  r.add("feature/graph-zoom", "Semantic zoom levels");
  r.add("main", "Update changelog");
  r.add("feature/graph-zoom", "Minimap");
  r.remotes.set("origin/main", r.branches.get("main")!);
  r.remotes.set("origin/feature/theme", r.branches.get("feature/theme")!);
  r.remotes.set("origin/feature/graph-zoom", r.branches.get("feature/graph-zoom")!);
  // A teammate's branch that exists only on the remote (no local branch yet).
  r.branch("feature/orbit-sync", "main");
  r.add("feature/orbit-sync", "Sync orbits across tabs");
  r.remotes.set("origin/feature/orbit-sync", r.branches.get("feature/orbit-sync")!);
  r.branches.delete("feature/orbit-sync");
  r.add("feature/graph-zoom", "Zoom to cursor");
  r.stashes.push({
    message: "On main: try warmer glow palette",
    id: fakeId(),
    base: r.branches.get("main")!,
    time: r.clock,
    changes: [{ path: "src/App.css", staged: null, unstaged: "modified", conflicted: false }],
  });
  r.head = "feature/graph-zoom";
  r.changes = [
    { path: "src/graph/renderer.ts", staged: null, unstaged: "modified", conflicted: false },
    { path: "src/graph/minimap.ts", staged: null, unstaged: "untracked", conflicted: false },
    { path: "README.md", staged: "modified", unstaged: null, conflicted: false },
  ];
  return r;
}

// --- fake diffs ---------------------------------------------------------------

const FILES = ["src/graph/renderer.ts", "src/graph/layout.ts", "src/App.tsx", "src/App.css", "README.md"];

export function fakeFile(path: string, seed: number, summary: string, status = "modified"): FileDiff {
  const start = 10 + (seed % 40);
  const ctx = (n: number, t: string) => ({ kind: " " as const, old: n, new: n + 1, text: t });
  const lines =
    status === "added" || status === "untracked"
      ? [`// ${summary}`, "export function demo() {", "  return 42;", "}"].map((text, i) => ({
          kind: "+" as const,
          old: null,
          new: i + 1,
          text,
        }))
      : [
          ctx(start, "  const view = state.view;"),
          ctx(start + 1, ""),
          { kind: "-" as const, old: start + 2, new: null, text: "  draw(ctx, view);" },
          { kind: "+" as const, old: null, new: start + 3, text: `  // ${summary}` },
          { kind: "+" as const, old: null, new: start + 4, text: "  draw(ctx, { ...view, glow: true });" },
          ctx(start + 3, "  return frame;"),
        ];
  const additions = lines.filter((l) => l.kind === "+").length;
  const deletions = lines.filter((l) => l.kind === "-").length;
  const header =
    status === "added" || status === "untracked"
      ? `@@ -0,0 +1,${lines.length} @@`
      : `@@ -${start},5 +${start},6 @@ function frame()`;
  return {
    path,
    oldPath: null,
    status,
    additions,
    deletions,
    binary: false,
    truncated: false,
    hunks: [{ header, key: `${path}:${seed}`, lines }],
  };
}

/** The demo files a commit "changed" (stable per commit id). */
export function filesOf(id: string) {
  const h = hash(id);
  return [...new Set(Array.from({ length: 1 + (h % 3) }, (_, i) => FILES[(h + i * 2) % FILES.length]))];
}

export function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
}

export const repo = seed();
export const res = (status: OpStatus, output = ""): OpResult => ({ status, output });
export const delay = <T>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));
export const fail = (msg: string) => Promise.reject(msg);
export type Table = { [C in Command]: (args: Args<C>) => Promise<Ret<C>> };
