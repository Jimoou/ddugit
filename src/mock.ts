// In-memory demo repository used when the UI runs outside Tauri
// (`npm run dev` in a plain browser). Supports the same operations as the
// real backend so the whole UX can be exercised without a repo on disk.

import type { CommitInfo, FileChange, OpResult, RefInfo, RepoSnapshot } from "./types";

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

  add(branch: string, summary: string, extraParents: string[] = []): string {
    const id = fakeId();
    const tip = this.branches.get(branch);
    const parents = [...(tip ? [tip] : []), ...extraParents];
    this.clock += 3600 * (2 + (seq % 7));
    this.commits.set(id, {
      id,
      parents,
      summary,
      message: summary + "\n",
      author: AUTHORS[seq % AUTHORS.length],
      email: `${AUTHORS[seq % AUTHORS.length].toLowerCase()}@otgit.dev`,
      time: this.clock,
    });
    this.order.unshift(id);
    this.branches.set(branch, id);
    return id;
  }

  branch(name: string, from: string) {
    this.branches.set(name, this.branches.get(from)!);
  }

  merge(source: string, target: string, summary?: string) {
    const src = this.branches.get(source) ?? source;
    return this.add(target, summary ?? `Merge branch '${source}' into ${target}`, [src]);
  }

  snapshot(): RepoSnapshot {
    const refs: RefInfo[] = [
      ...[...this.branches].map(([name, target]) => ({ name, kind: "local" as const, target })),
      ...[...this.remotes].map(([name, target]) => ({ name, kind: "remote" as const, target })),
      ...[...this.tags].map(([name, target]) => ({ name, kind: "tag" as const, target })),
    ];
    return {
      path: "/demo/otgit-demo",
      name: "otgit-demo",
      head: { branch: this.head, target: this.branches.get(this.head) ?? null },
      commits: this.order.map((id) => this.commits.get(id)!),
      refs,
      changes: this.changes.map((c) => ({ ...c })),
      state: this.state,
      truncated: false,
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
  r.add("feature/graph-zoom", "Zoom to cursor");
  r.head = "feature/graph-zoom";
  r.changes = [
    { path: "src/graph/renderer.ts", staged: null, unstaged: "modified", conflicted: false },
    { path: "src/graph/minimap.ts", staged: null, unstaged: "untracked", conflicted: false },
    { path: "README.md", staged: "modified", unstaged: null, conflicted: false },
  ];
  return r;
}

const repo = seed();
const ok = (output = ""): OpResult => ({ ok: true, conflict: false, output });
const delay = <T>(v: T) => new Promise<T>((res) => setTimeout(() => res(v), 120));

export const mock = {
  snapshot: () => delay(repo.snapshot()),

  commit(message: string, paths: string[]) {
    if (!message.trim()) return Promise.reject("Commit message is empty");
    const set = new Set(paths.length ? paths : repo.changes.map((c) => c.path));
    if (![...repo.changes].some((c) => set.has(c.path))) return Promise.reject("Nothing to commit");
    repo.add(repo.head, message.split("\n")[0]);
    repo.changes = repo.changes.filter((c) => !set.has(c.path));
    return delay(ok(`[${repo.head}] ${message}`));
  },

  merge(source: string, target: string | null) {
    const t = target ?? repo.head;
    if (!repo.branches.has(t)) return Promise.reject(`Unknown branch '${t}'`);
    repo.head = t;
    const label = repo.branches.has(source) ? source : source.slice(0, 7);
    repo.merge(source, t, `Merge ${repo.branches.has(source) ? `branch '${label}'` : `commit ${label}`} into ${t}`);
    return delay(ok("Merge made by the 'ort' strategy."));
  },

  mergeAbort() {
    repo.state = "clean";
    return delay(ok());
  },

  checkout(target: string) {
    if (!repo.branches.has(target)) return Promise.reject(`Unknown branch '${target}'`);
    repo.head = target;
    return delay(ok(`Switched to branch '${target}'`));
  },

  createBranch(name: string, at: string | null, sw: boolean) {
    if (repo.branches.has(name)) return Promise.reject(`Branch '${name}' already exists`);
    repo.branches.set(name, at ?? repo.branches.get(repo.head)!);
    if (sw) repo.head = name;
    return delay(ok());
  },
};
