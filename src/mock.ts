// In-memory demo repository used when the UI runs outside Tauri
// (`npm run dev` in a plain browser). Implements the same command table as the
// Rust backend so the whole UX can be exercised without a repo on disk.

import type { Args, Command, Ret } from "./api";
import type { CommitInfo, FileChange, FileDiff, OpResult, OpStatus, RefInfo, RemoteOp, RepoSnapshot } from "./types";

let seq = 0;
const fakeId = () => {
  seq += 1;
  let h = (seq * 2654435761) >>> 0;
  let out = "";
  for (let i = 0; i < 5; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    out += h.toString(16).padStart(8, "0");
  }
  return out;
};

const AUTHORS = ["Jimin", "Seoyeon", "Hyunwoo", "Minji"];

class MockRepo {
  commits = new Map<string, CommitInfo>();
  order: string[] = []; // newest first
  branches = new Map<string, string>();
  remotes = new Map<string, string>();
  tags = new Map<string, string>();
  head = "main";
  changes: FileChange[] = [];
  state = "clean";
  clock = Math.floor(Date.now() / 1000) - 86400 * 40;
  fetched = false;
  /** In-progress demo merge: source commit and the conflicted files' marked-up text. */
  pending: { source: string; label: string; files: Map<string, string> } | null = null;
  stashes: { message: string; id: string; base: string; time: number; changes: FileChange[] }[] = [];

  commit(parents: string[], summary: string, author = AUTHORS[seq % AUTHORS.length]): string {
    const id = fakeId();
    this.clock += 3600 * (2 + (seq % 7));
    this.commits.set(id, {
      id,
      parents,
      summary,
      message: summary + "\n",
      author,
      email: `${author.toLowerCase()}@otgit.dev`,
      time: this.clock,
    });
    this.order.unshift(id);
    return id;
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
    const name = `origin/${this.head}`;
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
      ...[...this.branches].map(([name, target]) => ({ name, kind: "local" as const, target })),
      ...[...this.remotes].map(([name, target]) => ({ name, kind: "remote" as const, target })),
      ...[...this.tags].map(([name, target]) => ({ name, kind: "tag" as const, target })),
    ];
    const [ahead, behind] = this.aheadBehind();
    // Like git, only list commits reachable from a ref (rebased-away ones vanish).
    const reachable = new Set<string>();
    for (const r of refs) for (const id of this.ancestors(r.target)) reachable.add(id);
    const all = this.order.filter((id) => reachable.has(id));
    return {
      path: "/demo/otgit-demo",
      name: "otgit-demo",
      head: {
        branch: this.head,
        target: this.branches.get(this.head) ?? null,
        upstream: this.upstream(),
        ahead,
        behind,
      },
      commits: all.slice(0, limit).map((id) => this.commits.get(id)!),
      refs,
      remotes: [{ name: "origin", url: "https://github.com/otgit/otgit-demo.git" }],
      changes: this.changes.map((c) => ({ ...c })),
      stashes: this.stashes.map(({ message, id, base, time }, index) => ({ index, message, id, base, time })),
      state: this.state,
      incoming: this.pending?.source ?? null,
      truncated: all.length > limit,
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

function fakeFile(path: string, seed: number, summary: string, status = "modified"): FileDiff {
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
    hunks: [{ header, lines }],
  };
}

function hash(s: string) {
  let h = 0;
  for (const ch of s) h = (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0;
  return h;
}

// --- demo conflicts ------------------------------------------------------------

const DEMO_CONFLICT_CSS = `:root {
  --bg: #07060d;
<<<<<<< HEAD
  --cyan: #22e8ff;
  --glow: 0 0 12px var(--cyan);
=======
  --cyan: #19d3ff;
  --glow: 0 0 18px var(--cyan), 0 0 32px var(--magenta);
>>>>>>> {theirs}
  --magenta: #ff3df2;
}

.panel {
<<<<<<< HEAD
  border-radius: 12px;
=======
  border-radius: 16px;
  backdrop-filter: blur(10px);
>>>>>>> {theirs}
}
`;

const DEMO_CONFLICT_TS = `export const COL = 84;
<<<<<<< HEAD
export const LANE = 46;
=======
export const LANE = 52;
>>>>>>> {theirs}
`;

// --- command table ------------------------------------------------------------

const repo = seed();
const res = (status: OpStatus, output = ""): OpResult => ({ status, output });
const delay = <T>(v: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(v), ms));
const fail = (msg: string) => Promise.reject(msg);

function pull(mode: "ff" | "merge" | "rebase"): OpResult | string {
  const up = repo.upstream();
  if (!up) return `'${repo.head}' has no upstream branch; push it first`;
  const [ahead, behind] = repo.aheadBehind();
  const remote = repo.remotes.get(up)!;
  if (behind === 0) return res("ok", "Already up to date.");
  if (ahead === 0) {
    repo.branches.set(repo.head, remote);
    return res("ok", "Fast-forward");
  }
  if (mode === "ff") return res("diverged", "fatal: Not possible to fast-forward, aborting.");
  if (mode === "merge") {
    repo.merge(up, repo.head, `Merge remote-tracking branch '${up}' into ${repo.head}`);
    return res("ok", "Merge made by the 'ort' strategy.");
  }
  // Rebase: replay local-only first-parent commits on top of the upstream.
  const theirs = repo.ancestors(remote);
  const mine: CommitInfo[] = [];
  for (let id = repo.branches.get(repo.head); id && !theirs.has(id);) {
    const c = repo.commits.get(id)!;
    mine.unshift(c);
    id = c.parents[0];
  }
  let tip = remote;
  for (const c of mine) tip = repo.commit([tip], c.summary, c.author);
  repo.branches.set(repo.head, tip);
  return res("ok", `Successfully rebased and updated refs/heads/${repo.head}.`);
}

/** Dev/e2e switch: make the next remote call fail authentication. */
export const demoControls = {
  failNextRemote: null as null | "https" | "ssh",
  /** Make the next merge stop on a conflict in two files. */
  conflictNext: false,
  /** Append `n` commits to the current branch (long straight runs for the graph). */
  grow(n: number) {
    for (let i = 0; i < n; i++) repo.add(repo.head, `Step ${i + 1} of ${n}`);
  },
};
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__otgitDemo = demoControls;
}

const AUTH_OUTPUT = {
  https: "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
  ssh: "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.",
};

const PHASES = {
  fetch: ["Receiving objects", "Resolving deltas"],
  push: ["Compressing objects", "Writing objects"],
};

function remoteOp(op: RemoteOp): OpResult | string {
  if (op === "fetch") {
    // First fetch: a teammate pushed to origin/main and to our branch.
    if (!repo.fetched) {
      repo.fetched = true;
      const main = repo.remotes.get("origin/main")!;
      repo.remotes.set("origin/main", repo.commit([main], "Teammate: tighten lane spacing", "Minji"));
      const up = repo.upstream();
      if (up) repo.remotes.set(up, repo.commit([repo.remotes.get(up)!], "Teammate: fix minimap drag", "Hyunwoo"));
    }
    return res("ok", "Fetching origin");
  }
  if (op === "push") {
    const local = repo.branches.get(repo.head)!;
    const up = repo.upstream();
    if (up && !repo.ancestors(local).has(repo.remotes.get(up)!)) return res("rejected", " ! [rejected]  (fetch first)");
    repo.remotes.set(up ?? `origin/${repo.head}`, local);
    return res("ok", up ? "" : `branch '${repo.head}' set up to track 'origin/${repo.head}'.`);
  }
  return pull(op === "pull" ? "ff" : op === "pullMerge" ? "merge" : "rebase");
}

type Table = { [C in Command]: (args: Args<C>) => Promise<Ret<C>> };

export const mock: Table = {
  initial_repo: () => delay(null, 0),
  repo_snapshot: ({ limit }) => delay(repo.snapshot(limit)),

  git_commit({ message, paths, amend, stagedOnly }) {
    if (!message.trim()) return fail("Commit message is empty");
    if (repo.pending) {
      // Concluding a merge: needs every conflict resolved, then a two-parent commit.
      if (repo.changes.some((c) => c.conflicted))
        return fail("Committing is not possible because you have unmerged files.");
      repo.add(repo.head, message.split("\n")[0], [repo.pending.source]);
      repo.pending = null;
      repo.state = "clean";
      repo.changes = repo.changes.filter((c) => c.unstaged && !c.staged);
      return delay(res("ok"));
    }
    if (stagedOnly) {
      if (!repo.changes.some((c) => c.staged)) return fail("nothing added to commit");
      repo.add(repo.head, message.split("\n")[0]);
      repo.changes = repo.changes.map((c) => ({ ...c, staged: null })).filter((c) => c.unstaged);
      return delay(res("ok"));
    }
    const set = new Set(paths.length || amend ? paths : repo.changes.map((c) => c.path));
    if (!amend && !repo.changes.some((c) => set.has(c.path))) return fail("Nothing to commit");
    if (amend) {
      // Replace the tip with a new commit that has the same parents.
      const old = repo.commits.get(repo.branches.get(repo.head)!)!;
      const id = repo.commit(old.parents, message.split("\n")[0], old.author);
      repo.branches.set(repo.head, id);
    } else repo.add(repo.head, message.split("\n")[0]);
    repo.changes = repo.changes.filter((c) => !set.has(c.path));
    return delay(res("ok", `[${repo.head}] ${message}`));
  },

  git_merge({ source, target }) {
    const t = target ?? repo.head;
    if (!repo.branches.has(t)) return fail(`Unknown branch '${t}'`);
    repo.head = t;
    if (demoControls.conflictNext) {
      demoControls.conflictNext = false;
      const files = new Map([
        ["src/App.css", DEMO_CONFLICT_CSS.replaceAll("{theirs}", source)],
        ["src/graph/scene.ts", DEMO_CONFLICT_TS.replaceAll("{theirs}", source)],
      ]);
      repo.pending = { source: repo.branches.get(source) ?? source, label: source, files };
      repo.state = "merge";
      for (const path of files.keys())
        repo.changes.push({ path, staged: null, unstaged: "modified", conflicted: true });
      return delay(res("conflict", "CONFLICT (content): Merge conflict in src/App.css"));
    }
    const named = repo.branches.has(source) || repo.remotes.has(source);
    repo.merge(source, t, `Merge ${named ? `branch '${source}'` : `commit ${source.slice(0, 7)}`} into ${t}`);
    return delay(res("ok", "Merge made by the 'ort' strategy."));
  },

  git_abort() {
    if (repo.pending) repo.changes = repo.changes.filter((c) => !repo.pending!.files.has(c.path));
    repo.pending = null;
    repo.state = "clean";
    return delay(res("ok"));
  },

  git_ref({ op }) {
    switch (op.kind) {
      case "renameBranch": {
        const id = repo.branches.get(op.from);
        if (!id) return fail(`branch '${op.from}' not found`);
        if (repo.branches.has(op.to)) return fail(`a branch named '${op.to}' already exists`);
        repo.branches.delete(op.from);
        repo.branches.set(op.to, id);
        if (repo.head === op.from) repo.head = op.to;
        return delay(res("ok"));
      }
      case "deleteBranch": {
        const id = repo.branches.get(op.name);
        if (!id) return fail(`branch '${op.name}' not found`);
        if (op.name === repo.head) return fail(`cannot delete branch '${op.name}' used by HEAD`);
        const merged = [...repo.branches].some(([n, t]) => n !== op.name && repo.ancestors(t).has(id));
        if (!merged && !op.force) return delay(res("unmerged", `error: the branch '${op.name}' is not fully merged`));
        repo.branches.delete(op.name);
        return delay(res("ok"));
      }
      case "createTag":
        if (repo.tags.has(op.name)) return fail(`tag '${op.name}' already exists`);
        repo.tags.set(op.name, op.at);
        return delay(res("ok"));
      case "deleteTag":
        repo.tags.delete(op.name);
        return delay(res("ok"));
      case "checkoutRemote": {
        const local = op.remoteRef.replace(/^[^/]+\//, "");
        if (!repo.branches.has(local)) repo.branches.set(local, repo.remotes.get(op.remoteRef)!);
        repo.head = local;
        return delay(res("ok"));
      }
    }
  },

  git_pick({ op, id, target }) {
    const c = repo.commits.get(id);
    if (!c) return fail(`Unknown commit ${id}`);
    const t = target ?? repo.head;
    if (!repo.branches.has(t)) return fail(`Unknown branch '${t}'`);
    repo.head = t;
    repo.add(t, op === "revert" ? `Revert "${c.summary}"` : c.summary);
    return delay(res("ok"));
  },

  git_continue() {
    repo.state = "clean";
    return delay(res("ok"));
  },

  git_checkout({ target }) {
    if (!repo.branches.has(target)) return fail(`Unknown branch '${target}'`);
    repo.head = target;
    return delay(res("ok", `Switched to branch '${target}'`));
  },

  git_create_branch({ name, at, switch: sw }) {
    if (repo.branches.has(name)) return fail(`Branch '${name}' already exists`);
    repo.branches.set(name, at ?? repo.branches.get(repo.head)!);
    if (sw) repo.head = name;
    return delay(res("ok"));
  },

  async git_remote({ op, onProgress }) {
    const fake = demoControls.failNextRemote;
    if (fake) {
      demoControls.failNextRemote = null;
      await delay(null, 300);
      return res("auth", AUTH_OUTPUT[fake]);
    }
    for (const phase of PHASES[op === "push" ? "push" : "fetch"]) {
      for (let pct = 0; pct <= 100; pct += 20) {
        onProgress.onmessage({ phase, percent: pct });
        await delay(null, 60);
      }
    }
    const r = remoteOp(op);
    return typeof r === "string" ? fail(r) : r;
  },

  git_discard({ paths }) {
    const set = new Set(paths);
    repo.changes = repo.changes.filter((c) => !set.has(c.path));
    return delay(res("ok"));
  },

  git_stash_push({ message, paths }) {
    const set = new Set(paths.length ? paths : repo.changes.map((c) => c.path));
    const moved = repo.changes.filter((c) => set.has(c.path));
    if (!moved.length) return fail("No local changes to save");
    repo.changes = repo.changes.filter((c) => !set.has(c.path));
    repo.stashes.unshift({
      message: `On ${repo.head}: ${message || "otgit stash"}`,
      id: fakeId(),
      base: repo.branches.get(repo.head)!,
      time: Math.floor(Date.now() / 1000),
      changes: moved,
    });
    return delay(res("ok", "Saved working directory and index state"));
  },

  git_stash({ op, index }) {
    const st = repo.stashes[index];
    if (!st) return fail(`stash@{${index}} does not exist`);
    if (op !== "drop") {
      const have = new Set(repo.changes.map((c) => c.path));
      repo.changes.push(...st.changes.filter((c) => !have.has(c.path)));
    }
    if (op !== "apply") repo.stashes.splice(index, 1);
    return delay(res("ok"));
  },

  conflict_file({ file }) {
    const merged = repo.pending?.files.get(file);
    if (merged === undefined) return fail(`'${file}' is not in conflict`);
    const side = (pick: 1 | 2) => merged.replace(/<<<<<<< .*\n([\s\S]*?)=======\n([\s\S]*?)>>>>>>> .*\n/g, `$${pick}`);
    return delay({ path: file, base: null, ours: side(1), theirs: side(2), merged, binary: false });
  },

  git_resolve({ file, how }) {
    const c = repo.changes.find((x) => x.path === file && x.conflicted);
    if (!c) return fail(`'${file}' is not in conflict`);
    Object.assign(c, { conflicted: false, staged: "modified", unstaged: null });
    void how;
    return delay(res("ok"));
  },

  commit_diff({ id }) {
    const st = repo.stashes.find((x) => x.id === id);
    if (st)
      return delay(st.changes.map((c) => fakeFile(c.path, hash(c.path), st.message, c.unstaged ?? c.staged ?? "")));
    const c = repo.commits.get(id);
    if (!c) return fail(`Unknown commit ${id}`);
    const h = hash(id);
    const n = 1 + (h % 3);
    const files = Array.from({ length: n }, (_, i) => FILES[(h + i * 2) % FILES.length]);
    const status = (i: number) => (c.parents.length === 0 || (i === n - 1 && h % 4 === 0) ? "added" : "modified");
    return delay([...new Set(files)].map((f, i) => fakeFile(f, h + i, c.summary, status(i))));
  },

  git_stage_hunks({ file, unstage }) {
    // Demo files have one hunk, so staging a hunk (or some of its lines) moves the whole file.
    const c = repo.changes.find((x) => x.path === file);
    if (!c) return fail(`No changes to '${file}'`);
    const kind = c.unstaged ?? c.staged ?? "modified";
    Object.assign(
      c,
      unstage ? { staged: null, unstaged: kind } : { staged: kind === "untracked" ? "added" : kind, unstaged: null },
    );
    return delay(res("ok"));
  },

  worktree_diff({ file, scope }) {
    const inScope = (c: FileChange) => scope === "all" || (scope === "staged" ? !!c.staged : !!c.unstaged);
    const list = repo.changes.filter((c) => (!file || c.path === file) && inScope(c));
    return delay(list.map((c) => fakeFile(c.path, hash(c.path), "work in progress", c.unstaged ?? c.staged ?? "")));
  },
};
