// In-memory demo repository used when the UI runs outside Tauri
// (`npm run dev` in a plain browser). Implements the same command table as the
// Rust backend so the whole UX can be exercised without a repo on disk.

import type { Args, Command, Ret } from "./api";
import type {
  BackportItem,
  Blame,
  CommitInfo,
  FileChange,
  FileDiff,
  Identity,
  IdentityOp,
  OpResult,
  OpStatus,
  PullRequest,
  RefInfo,
  RemoteOp,
  ReflogEntry,
  RepoGlance,
  RepoSnapshot,
  Signature,
  SubmoduleInfo,
  TodoItem,
} from "./types";
import { applyPlan } from "./rebasePlan";
import { version as appVersion } from "../package.json";

/** The demo's SSH state: keys made and hosts trusted in this session. */
/** Bumped by cancelling, so a pending demo sign-in ends as "Cancelled". */
const demoActivation = { n: 0 };
const demoLicense = { current: null as import("./types").LicenseInfo | null };
/** The demo license as `license_status` reports it (demo licenses never lapse or sit on another computer). */
const demoLicenseStatus = (): import("./types").LicenseStatus => ({
  license: demoLicense.current,
  newerThanLicense: false,
  checkable: true,
  expired: false,
  otherDevice: false,
});
/** Put `license` on the demo computer (null removes it) and follow it with Pro. */
function putDemoLicense(license: import("./types").LicenseInfo | null) {
  demoLicense.current = license;
  demoControls.pro = license
    ? { pro: true, source: license.kind === "site" ? "site" : "license" }
    : { pro: false, source: "free" };
  return demoLicenseStatus();
}
/** What ddugit.com signs for a purchase activated on the demo computer. */
const DEMO_LIFETIME: import("./types").LicenseInfo = {
  id: "lic_demo_life",
  name: "Demo User",
  email: "me@demo.example",
  kind: "personal",
  seats: 1,
  issued: "2026-10-05",
  updatesUntil: "9999-12-31",
  plan: "lifetime",
  device: "5f0c…demo",
};
/** The demo's LFS: two patterns, three files whose content isn't downloaded yet. */
const demoLfs = {
  patterns: ["*.psd", "assets/**/*.png"],
  filters: true,
  missing: ["art/cover.psd", "assets/hero.png", "assets/nebula.png"],
};
const demoSsh = { keys: [] as { name: string; public: string }[], trusted: [] as string[] };

/** The demo's git config for identity and signing: global, and each repository's own. */
type DemoConfig = Partial<Record<"name" | "email" | "sign" | "format" | "key", string>>;
const demoIdentity = {
  global: { name: "Demo Pilot", email: "pilot@ddugit.dev" } as DemoConfig,
  local: new Map<string, DemoConfig>(),
};
function demoReadIdentity(path: string | null): Identity {
  const local = (path && demoIdentity.local.get(path)) || {};
  const at = (k: keyof DemoConfig) => {
    if (local[k] !== undefined) return { value: local[k], scope: "local" };
    if (demoIdentity.global[k] !== undefined) return { value: demoIdentity.global[k], scope: "global" };
    return null;
  };
  const sign = at("sign");
  return {
    name: at("name"),
    email: at("email"),
    sign: sign && { value: sign.value === "true", scope: sign.scope },
    format: at("format"),
    key: at("key"),
  };
}
function demoSetIdentity(path: string | null, op: IdentityOp): OpResult | string {
  if (op.scope === "local" && !path) return "No repository to set this for";
  const cfg = op.scope === "global" ? demoIdentity.global : (demoIdentity.local.get(path!) ?? {});
  if (op.kind === "apply") {
    if (!op.profile.name.trim() || !op.profile.email.trim()) return "Name can't be empty or span lines";
    Object.assign(cfg, { name: op.profile.name.trim(), email: op.profile.email.trim() });
    if (op.profile.signing)
      Object.assign(cfg, { sign: "true", format: op.profile.signing.format, key: op.profile.signing.key });
    else for (const k of ["sign", "format", "key"] as const) delete cfg[k];
  } else if (op.kind === "sign") cfg.sign = String(op.on);
  else for (const k of Object.keys(cfg) as (keyof DemoConfig)[]) delete cfg[k];
  if (op.scope === "local") demoIdentity.local.set(path!, cfg);
  return { status: "ok", output: "" };
}
/** Signatures on seeded commits (by summary), and commits made while signing was on. */
const DEMO_SIGNED: Record<string, Signature> = {
  "Zoom to cursor": {
    status: "verified",
    signer: "Jimin <jimin@ddugit.dev>",
    key: "SHA256:+i8Ls5u5p/tmc0Ro2eG4a2sKWA5KhHz2eKb14CYU8lU",
  },
  Minimap: { status: "unverified", signer: "", key: "4AEE18F83AFDEB23" },
};
const demoSigned = new Set<string>();

/** Where the demo repository "is" on disk. */
const DEMO_ROOT = "/demo/ddugit-demo";

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
      ...[...this.branches].map(([name, target]) => ({ name, kind: "local" as const, target })),
      ...[...this.remotes].map(([name, target]) => ({ name, kind: "remote" as const, target })),
      ...[...this.tags].map(([name, target]) => ({ name, kind: "tag" as const, target })),
    ];
    const [ahead, behind] = this.aheadBehind();
    // Like git, only list commits reachable from a ref (rebased-away ones vanish).
    const reachable = new Set<string>();
    const stack = refs.map((r) => r.target);
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
        branch: this.head,
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
      ].map((w) => ({ ...w, head: this.branches.get(w.branch) ?? null, locked: false, missing: false })),
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

/** The demo files a commit "changed" (stable per commit id). */
function filesOf(id: string) {
  const h = hash(id);
  return [...new Set(Array.from({ length: 1 + (h % 3) }, (_, i) => FILES[(h + i * 2) % FILES.length]))];
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

/**
 * git's `--rebase-merges` todo for `base..head`, in its shape: the first-parent
 * line, and before each merge the side it brings in (rebuilt from where it
 * left the line, or from outside the range), labelled for the merge.
 */
function todoFor(base: string, head: string): TodoItem[] {
  const stop = repo.ancestors(base);
  const at = (id: string) => repo.commits.get(id)!;
  const chain: string[] = [];
  for (let id = head; !stop.has(id); id = at(id).parents[0]) chain.unshift(id);
  const onChain = new Set(chain);
  const point = (id: string) => `branch-point-${id.slice(0, 7)}`;
  const sides = new Map<string, { ids: string[]; from: string; out: string }>();
  for (const id of chain) {
    const [, other] = at(id).parents;
    if (!other) continue;
    const ids: string[] = [];
    let cur = other;
    while (!stop.has(cur) && !onChain.has(cur)) {
      ids.unshift(cur);
      cur = at(cur).parents[0];
    }
    sides.set(id, { ids, from: cur === base ? "onto" : onChain.has(cur) ? point(cur) : cur, out: other });
  }
  const starts = new Set([...sides.values()].map((x) => x.from));
  const start = chain.length ? at(chain[0]).parents[0] : base;
  const items: TodoItem[] = [
    { kind: "label", name: "onto" },
    { kind: "reset", to: start === base ? "onto" : start },
  ];
  let n = 0;
  for (const id of chain) {
    const side = sides.get(id);
    if (side && side.ids.length) {
      const [here, label] = [`main-${++n}`, `side-${n}`];
      items.push({ kind: "label", name: here }, { kind: "reset", to: side.from });
      for (const s of side.ids) items.push({ kind: "pick", id: s, summary: at(s).summary });
      items.push({ kind: "label", name: label }, { kind: "reset", to: here });
      items.push({ kind: "merge", id, label, summary: at(id).summary });
    } else if (side) items.push({ kind: "merge", id, label: side.out, summary: at(id).summary });
    else items.push({ kind: "pick", id, summary: at(id).summary });
    if (starts.has(point(id))) items.push({ kind: "label", name: point(id) });
  }
  return items;
}
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

/** Pull requests opened in the demo (they join the two it starts with). */
const demoNewPrs: { number: number; branch: string; title: string; draft: boolean }[] = [];
/** Open demo pull requests by branch, to answer "already exists". */
const demoOpenPr = (branch: string) =>
  [{ number: 12, branch: "feature/theme" }, { number: 15, branch: "hotfix/crash" }, ...demoNewPrs].find(
    (p) => p.branch === branch && repo.branches.has(p.branch),
  );

/** Forge hosts the demo has a token for (pasted in this session). */
const demoForgeHosts = new Set<string>();
/** The demo user's repositories on a forge: name, description, private, days since the last update. */
const DEMO_FORGE_REPOS: [string, string | null, boolean, number][] = [
  ["stella/ddugit-demo", "The demo repository you're looking at", false, 0],
  ["stella/dotfiles", "Shell, editor and terminal settings", false, 2],
  ["orbit-labs/launchpad", "Mission control web app", true, 3],
  ["orbit-labs/telemetry", "Ingest and chart rocket sensor data", true, 6],
  ["stella/rocket-notes", null, false, 9],
  ["orbit-labs/design-system", "Shared UI components and tokens", false, 15],
  ["orbit-labs/infra", "Terraform for the ground station", true, 40],
  ["stella/starfield", "A tiny canvas starfield", false, 120],
];

/** Dev/e2e hooks, exposed as `window.__ddugitDemo`. */
export const demoControls = {
  /** Make the next remote call fail authentication. */
  failNextRemote: null as null | "https" | "ssh",
  /** Local branches the demo reports as deleted on the remote. */
  goneBranches: [] as string[],
  /** Folder the next "choose folder" dialog returns (default: the demo repository). */
  nextFolder: null as string | null,
  /** Make the next merge stop on a conflict in two files. */
  conflictNext: false,
  /** Make the next backport stop on a commit whose change is already there (nothing to commit). */
  emptyNext: false,
  /** How the demo's GitHub token is found: logged-in `gh`, a saved one, none, or refused. */
  forgeToken: "cli" as "cli" | "keychain" | "none" | "unauthorized",
  /** Free or Pro in the demo (Pro by default, so every feature shows). Set `window.__ddugitDemoPro` before load to change it. */
  pro: (((typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__ddugitDemoPro) as
    import("./types").ProStatus | undefined) ?? {
    pro: true,
    source: "license",
  }) as import("./types").ProStatus,
  /** ddugit.com has this device removed from the license: the next check drops it. */
  deviceRemoved: false,
  /** ddugit.com can't be reached when removing this device. */
  offline: false,
  /** Install a demo license (e2e): a lifetime license on this device, or a site license. */
  setLicense(kind: "lifetime" | "site" | null) {
    putDemoLicense(
      kind === "lifetime"
        ? { ...DEMO_LIFETIME }
        : kind === "site"
          ? {
              id: "lic_demo",
              name: "Demo Corp",
              email: "it@demo.example",
              kind: "site",
              seats: 50,
              issued: "2026-10-02",
              updatesUntil: "2027-10-02",
            }
          : null,
    );
  },
  /** A newer version the demo announces (the update notice). Set `window.__ddugitDemoUpdate` before load to see it at startup. */
  update: ((typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__ddugitDemoUpdate) ??
    null) as import("./types").UpdateInfo | null,
  /** git can't be found (the first-run notice). Set `window.__ddugitDemoGitMissing` before load to see it at startup. */
  gitMissing: !!(
    typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__ddugitDemoGitMissing
  ),
  /** Make the next checkout fail with this text, like an unexpected backend error (the toast's Report button). */
  failNext: null as string | null,
  /** How the next problem reports fail: the site's rate limit, or no network. */
  reportFail: null as null | "limited" | "offline",
  /** Problem reports and questions sent from the demo (e2e reads them). */
  sent: [] as import("./types").NewReport[],
  /** Current demo state, read synchronously (e2e assertions). */
  snapshot: () => repo.snapshot(),
  /** Append `n` commits to the current branch (long straight runs for the graph). */
  grow(n: number) {
    for (let i = 0; i < n; i++) repo.add(repo.head, `Step ${i + 1} of ${n}`);
  },
  /** Swap in another history, e.g. a big repository's snapshot (performance checks, docs/PERF.md). */
  loadHistory(snap: Pick<RepoSnapshot, "commits" | "refs" | "head">) {
    repo.commits = new Map(snap.commits.map((c) => [c.id, c]));
    repo.order = snap.commits.map((c) => c.id);
    const of = (kind: RefInfo["kind"]) =>
      new Map(snap.refs.filter((r) => r.kind === kind).map((r) => [r.name, r.target] as const));
    repo.branches = of("local");
    repo.remotes = of("remote");
    repo.tags = of("tag");
    repo.stashes = [];
    if (snap.head.branch) repo.head = snap.head.branch;
  },
  /** Files every commit diff returns instead of the made-up ones (performance checks). */
  diffs: null as FileDiff[] | null,
  /** A new commit on `branch` (e.g. the bottom of a stack moving on). */
  commitOn(branch: string, summary: string) {
    repo.add(branch, summary);
  },
};
/** A license on the demo computer from the start (e2e): set `window.__ddugitDemoLicense` before load. */
const initialLicense = (typeof window !== "undefined" &&
  (window as unknown as Record<string, unknown>).__ddugitDemoLicense) as
  { kind: "lifetime" | "site"; deviceRemoved?: boolean } | undefined;
if (initialLicense) {
  demoControls.setLicense(initialLicense.kind);
  demoControls.deviceRemoved = !!initialLicense.deviceRemoved;
}
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__ddugitDemo = demoControls;
}

/** Demo commits read like a Conventional Commits history, so the release notes have sections. */
function demoConventional(summary: string): string {
  if (/^Merge /.test(summary)) return summary;
  if (/^Fix /.test(summary)) return `fix: ${summary.slice(4)}`;
  if (/^(Bump|Set up|Update|Initial)/.test(summary)) return `chore: ${summary[0].toLowerCase()}${summary.slice(1)}`;
  return `feat: ${summary[0].toLowerCase()}${summary.slice(1)}`;
}

/** Stacked branches in the demo: branch → parent and the parent's tip it was last built on. */
const demoStacks = new Map<string, { parent: string; base: string }>();

function demoStackList(): import("./types").StackBranch[] {
  return [...demoStacks]
    .filter(([name]) => repo.branches.has(name))
    .map(([name, s]) => {
      const parentTip = repo.branches.get(s.parent);
      const mine = repo.ancestors(repo.branches.get(name)!);
      const below = repo.ancestors(parentTip ?? s.base);
      return {
        name,
        parent: s.parent,
        parentMissing: !parentTip,
        behind: !!parentTip && !mine.has(parentTip),
        own: [...mine].filter((id) => !below.has(id)).length,
      };
    });
}

/** Rebuild the stack `branch` is in, bottom up: each branch's own commits replayed onto its parent. */
function demoRestack(branch: string): OpResult | string {
  let root = branch;
  const seen = new Set([root]);
  for (let p = demoStacks.get(root)?.parent; p && demoStacks.has(p) && !seen.has(p); p = demoStacks.get(p)?.parent) {
    root = p;
    seen.add(p);
  }
  const order = [root];
  for (let i = 0; i < order.length; i++)
    for (const [b, s] of demoStacks) if (s.parent === order[i] && !order.includes(b)) order.push(b);
  let moved = 0;
  for (const b of order) {
    const s = demoStacks.get(b)!;
    const parentTip = repo.branches.get(s.parent);
    if (!parentTip) return `'${b}' sits on '${s.parent}', which no longer exists: pick a new parent`;
    const tip = repo.branches.get(b)!;
    if (!repo.ancestors(tip).has(parentTip)) {
      const below = repo.ancestors(s.base);
      const own: string[] = [];
      for (let c: string | undefined = tip; c && !below.has(c); c = repo.commits.get(c)?.parents[0]) own.unshift(c);
      let at = parentTip;
      for (const id of own) {
        const c = repo.commits.get(id)!;
        at = repo.commit([at], c.summary, c.author);
      }
      repo.branches.set(b, at);
      moved++;
    }
    s.base = parentTip;
  }
  return res("ok", moved ? "" : "Already up to date");
}

/** What the demo has sent to each destination (`transfer_history`). */
const demoTransfers: import("./types").TransferSent[] = [];

/** What Pro-only commands answer without Pro (`pro::LOCKED`). */
const PRO_LOCKED = "This is a ddugit Pro feature";

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
  if (op === "forcePush") {
    // The demo has no other pushers, so the lease always holds.
    repo.remotes.set(repo.upstream() ?? `origin/${repo.head}`, repo.branches.get(repo.head)!);
    return res("ok", " + forced update");
  }
  if (op === "push") {
    const local = repo.branches.get(repo.head)!;
    const up = repo.upstream();
    const upRemote = up?.split("/")[0];
    if (upRemote && repo.fetchOnly.has(upRemote))
      return res("failed", `'${repo.head}' follows ${up}, and ${upRemote} is fetch-only: nothing is pushed there.`);
    if (up && !repo.ancestors(local).has(repo.remotes.get(up)!)) return res("rejected", " ! [rejected]  (fetch first)");
    repo.remotes.set(up ?? `origin/${repo.head}`, local);
    return res("ok", up ? "" : `branch '${repo.head}' set up to track 'origin/${repo.head}'.`);
  }
  return pull(op === "pull" ? "ff" : op === "pullMerge" ? "merge" : "rebase");
}

const GLANCE_BRANCHES = ["main", "develop", "feature/orbit", "release/2.1"];
const GLANCE_SUMMARIES = ["Tune lane spacing", "Fix login redirect", "Bump dependencies", "Add export dialog"];

/**
 * Every folder "is" the demo repository, but a dashboard of identical worlds
 * shows nothing; each path gets its own steady, made-up state instead. Paths
 * named like a missing folder (`gone`) can't be read.
 */
/** What batch work changed in the dashboard's demo repositories (branch switched, pulled). */
const demoWorlds = new Map<string, Partial<RepoGlance>>();

function demoGlance(path: string): RepoGlance {
  return { ...demoGlanceBase(path), ...demoWorlds.get(path) };
}

function demoGlanceBase(path: string): RepoGlance {
  let h = 2166136261;
  for (const ch of path) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pick = (shift: number, n: number) => (h >>> shift) % n;
  const empty = { branch: null, upstream: null, ahead: 0, behind: 0, changes: 0, conflicts: 0, stashes: 0 };
  if (/gone/.test(path))
    return {
      path,
      error: `could not find repository at '${path}'`,
      ...empty,
      state: "clean",
      remotes: 0,
      origin: null,
      last: null,
    };
  const branch = GLANCE_BRANCHES[pick(0, 4)];
  const stopped = pick(20, 7) === 0;
  return {
    path,
    error: null,
    branch,
    upstream: `origin/${branch}`,
    ahead: pick(3, 3),
    behind: pick(6, 4),
    changes: stopped ? 2 : pick(9, 3) === 0 ? 0 : pick(11, 6),
    conflicts: stopped ? 1 : 0,
    state: stopped ? "merge" : "clean",
    stashes: pick(14, 3) === 0 ? 1 : 0,
    remotes: 1,
    // Owner from the folder name's first word (`acme-main` → acme), so the demo has something to suggest.
    origin: `https://github.com/${(path.split("/").pop() ?? "").split("-")[0]}/${path.split("/").pop()}.git`,
    last: {
      summary: GLANCE_SUMMARIES[pick(16, 4)],
      author: AUTHORS[pick(18, 4)],
      time: Math.floor(Date.now() / 1000) - 600 - pick(22, 200) * 1800,
    },
  };
}

/** Candidates, the commit to test next (the middle one) and the culprit, like git computes them. */
function mockBisect() {
  const b = repo.bisect!;
  const good = new Set(b.good.flatMap((g) => [...repo.ancestors(g)]));
  const candidates = repo.order.filter(
    (id) => repo.ancestors(b.bad).has(id) && !good.has(id) && !b.skipped.includes(id),
  );
  const culprit = candidates.length === 1 ? candidates[0] : null;
  const rest = candidates.filter((id) => id !== b.bad);
  const current = culprit ? null : (rest[Math.floor(rest.length / 2)] ?? null);
  return { bad: b.bad, good: b.good, skipped: b.skipped, current, culprit, candidates };
}

/** A commit in the demo (signing is noted by `git_commit`). */
function demoCommit({ message, paths, amend, stagedOnly }: Args<"git_commit">): Promise<OpResult> {
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
}

type Table = { [C in Command]: (args: Args<C>) => Promise<Ret<C>> };

const mockTable: Table = {
  initial_repo: () => delay(null, 0),
  // Any folder "is" the demo repository, except ones named like a plain folder.
  repo_root: ({ dir }) => delay(/not-a-repo/.test(dir) ? null : dir, 0),
  async git_clone({ url, onProgress }) {
    const fake = demoControls.failNextRemote;
    if (fake) {
      demoControls.failNextRemote = null;
      await delay(null, 200);
      return res("auth", AUTH_OUTPUT[fake]);
    }
    if (!url.trim()) return fail("Enter a repository URL");
    for (const phase of PHASES.fetch)
      for (let pct = 0; pct <= 100; pct += 25) {
        onProgress.onmessage({ phase, percent: pct });
        await delay(null, 40);
      }
    return res("ok", `Cloning into '${url}'...`);
  },
  git_init: () => delay(res("ok", "Initialized empty Git repository")),
  repo_snapshot: ({ limit }) => delay(repo.snapshot(limit)),
  repo_glance: ({ paths }) => delay(paths.map(demoGlance)),

  async git_commit(args) {
    const r = await demoCommit(args);
    const id = demoReadIdentity(args.path);
    if (r.status === "ok" && id.sign?.value && id.key) demoSigned.add(repo.branches.get(repo.head)!);
    return r;
  },
  identity_read: ({ path }) => delay(demoReadIdentity(path), 40),
  git_identity({ path, op }) {
    const r = demoSetIdentity(path, op);
    return typeof r === "string" ? fail(r) : delay(r);
  },
  signing_keys: () =>
    delay({
      gpg: [{ id: "3AA5C34371567BD2", label: "Demo Pilot <pilot@ddugit.dev>" }],
      ssh: [{ id: "/home/pilot/.ssh/id_ed25519.pub", label: "id_ed25519 · pilot@ddugit.dev" }],
    }),
  commit_signature({ id }) {
    const c = repo.commits.get(id);
    if (!c) return fail(`bad revision '${id}'`);
    const own: Signature = { status: "verified", signer: demoIdentity.global.name ?? "", key: "SHA256:demo" };
    return delay(DEMO_SIGNED[c.summary] ?? (demoSigned.has(id) ? own : { status: "none", signer: "", key: "" }), 30);
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
    if (repo.bisect) {
      repo.bisect = null;
      return delay(res("ok", "Bisect reset"));
    }
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
        const stacked = demoStacks.get(op.from);
        demoStacks.delete(op.from);
        if (stacked) demoStacks.set(op.to, stacked);
        for (const s of demoStacks.values()) if (s.parent === op.from) s.parent = op.to;
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
      case "addRemote": {
        if (repo.remoteUrls.has(op.name)) return fail(`error: remote ${op.name} already exists.`);
        repo.remoteUrls.set(op.name, op.url);
        if (op.fetchOnly) repo.fetchOnly.add(op.name);
        return delay(res("ok"));
      }
      case "setPushable": {
        if (op.pushable) repo.fetchOnly.delete(op.name);
        else repo.fetchOnly.add(op.name);
        return delay(res("ok"));
      }
      case "removeRemote":
        if (!repo.remoteUrls.delete(op.name)) return fail(`error: No such remote: '${op.name}'`);
        for (const r of [...repo.remotes.keys()]) if (r.startsWith(`${op.name}/`)) repo.remotes.delete(r);
        return delay(res("ok"));
      case "checkoutRemote": {
        const local = op.name ?? op.remoteRef.replace(/^[^/]+\//, "");
        if (op.name && repo.branches.has(op.name)) return fail(`Branch '${op.name}' already exists`);
        if (!repo.branches.has(local)) {
          repo.branches.set(local, repo.remotes.get(op.remoteRef)!);
          repo.tracking.set(local, op.remoteRef);
        }
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

  git_skip() {
    if (repo.state === "clean") return fail("Nothing to skip (clean)");
    for (const summary of repo.skipRest) repo.add(repo.head, summary);
    repo.skipRest = [];
    repo.state = "clean";
    return delay(res("ok"));
  },

  async git_push_to({ remote: name, branch, onProgress }) {
    if (repo.fetchOnly.has(name)) return fail(`${name} is fetch-only`);
    const b = branch ?? repo.head;
    if (!repo.branches.has(b)) return fail(`Unknown branch '${b}'`);
    for (let pct = 0; pct <= 100; pct += 25) {
      onProgress.onmessage({ phase: "Writing objects", percent: pct });
      await delay(null, 40);
    }
    repo.remotes.set(`${name}/${b}`, repo.branches.get(b)!);
    repo.tracking.set(b, `${name}/${b}`);
    return res("ok", `branch '${b}' set up to track '${name}/${b}'.`);
  },

  git_continue() {
    repo.state = "clean";
    return delay(res("ok"));
  },

  git_checkout({ target }) {
    const crash = demoControls.failNext;
    if (crash) {
      demoControls.failNext = null;
      return fail(crash);
    }
    if (!repo.branches.has(target)) return fail(`Unknown branch '${target}'`);
    const elsewhere = repo.worktrees.find((w) => w.branch === target);
    if (elsewhere) return fail(`fatal: '${target}' is already used by worktree at '${elsewhere.path}'`);
    repo.head = target;
    return delay(res("ok", `Switched to branch '${target}'`));
  },

  git_worktree({ op }) {
    if (op.kind === "prune") return delay(res("ok"));
    if (op.kind === "remove") {
      if (/dirty/.test(op.dir) && !op.force)
        return delay(
          res("unmerged", `fatal: '${op.dir}' contains modified or untracked files, use --force to delete it`),
        );
      repo.worktrees = repo.worktrees.filter((w) => w.path !== op.dir);
      return delay(res("ok"));
    }
    const branch = op.newBranch ?? op.branch;
    if (!branch) return fail("Choose a branch for the new worktree");
    if (op.newBranch) {
      if (repo.branches.has(op.newBranch))
        return delay(res("failed", `fatal: a branch named '${branch}' already exists`));
      repo.branches.set(op.newBranch, repo.branches.get(op.at ?? repo.head) ?? op.at ?? repo.branches.get(repo.head)!);
    }
    const used = branch === repo.head ? DEMO_ROOT : repo.worktrees.find((w) => w.branch === branch)?.path;
    if (used) return delay(res("failed", `fatal: '${branch}' is already used by worktree at '${used}'`));
    repo.worktrees.push({ path: op.dir, branch });
    return delay(res("ok", `Preparing worktree (checking out '${branch}')`));
  },

  git_submodule({ op }) {
    if (op.kind === "update")
      for (const m of repo.submodules)
        if (!op.path || m.path === op.path) Object.assign(m, { checkedOut: m.recorded, state: "clean" });
    return delay(res("ok", op.kind === "sync" ? "Synchronizing submodule url for 'vendor/stardust'" : ""));
  },

  lfs_status: () =>
    delay({
      version: "git-lfs/3.4.1 (demo)",
      patterns: [...demoLfs.patterns],
      filters: demoLfs.filters,
      missing: demoLfs.missing.length,
      missingFiles: [...demoLfs.missing],
    }),
  git_lfs({ op }) {
    if (op.kind === "install") demoLfs.filters = true;
    else if (op.kind === "pull") demoLfs.missing = [];
    else {
      const has = demoLfs.patterns.includes(op.pattern);
      if (op.kind === "track" && !has) demoLfs.patterns.push(op.pattern);
      if (op.kind === "untrack") demoLfs.patterns = demoLfs.patterns.filter((x) => x !== op.pattern);
      // Tracking edits .gitattributes, which then waits to be committed.
      if (!repo.changes.some((c) => c.path === ".gitattributes"))
        repo.changes.push({ path: ".gitattributes", staged: null, unstaged: "modified", conflicted: false });
      return delay(res("ok", `${op.kind === "track" ? "Tracking" : "Untracking"} "${op.pattern}"`));
    }
    return delay(res("ok"));
  },

  git_create_branch({ name, at, switch: sw }) {
    if (repo.branches.has(name)) return fail(`Branch '${name}' already exists`);
    repo.branches.set(name, at ?? repo.branches.get(repo.head)!);
    if (sw) repo.head = name;
    return delay(res("ok"));
  },

  async git_remote({ path, op, onProgress }) {
    // A dashboard world (not the demo tab, api.ts's DEMO_PATH): pull fast-forwards, or reports it can't.
    if (path !== "demo" && op === "pull") {
      const g = demoGlance(path);
      if (g.ahead && g.behind) return delay(res("diverged", "fatal: Not possible to fast-forward, aborting."));
      demoWorlds.set(path, { ...demoWorlds.get(path), behind: 0 });
      return delay(res("ok", g.behind ? "Fast-forward" : "Already up to date."));
    }
    const fake = demoControls.failNextRemote;
    if (fake) {
      demoControls.failNextRemote = null;
      await delay(null, 300);
      return res("auth", AUTH_OUTPUT[fake]);
    }
    for (const phase of PHASES[op === "push" || op === "forcePush" ? "push" : "fetch"]) {
      for (let pct = 0; pct <= 100; pct += 20) {
        onProgress.onmessage({ phase, percent: pct });
        await delay(null, 60);
      }
    }
    const r = remoteOp(op);
    return typeof r === "string" ? fail(r) : r;
  },

  async git_fetch_remote({ name, onProgress }) {
    if (!repo.remoteUrls.has(name)) return res("failed", `fatal: '${name}' does not appear to be a git repository`);
    for (const phase of PHASES.fetch)
      for (let pct = 0; pct <= 100; pct += 10) {
        onProgress.onmessage({ phase, percent: pct });
        await delay(null, 50);
      }
    // Stand-in for what the first fetch brings: the other project's main with two fixes.
    if (![...repo.remotes.keys()].some((k) => k.startsWith(`${name}/`))) {
      let tip = repo.remotes.get("origin/main")!;
      for (const fix of ["Fix crash on empty repository", "Escape branch names in labels"])
        tip = repo.commit([tip], fix);
      repo.remotes.set(`${name}/main`, tip);
    }
    return res("ok", `From ${repo.remoteUrls.get(name)}`);
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
      message: `On ${repo.head}: ${message || "ddugit stash"}`,
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
    if (demoControls.diffs) return delay(demoControls.diffs);
    const c = repo.commits.get(id);
    if (!c) return fail(`Unknown commit ${id}`);
    const h = hash(id);
    const files = filesOf(id);
    const status = (i: number) =>
      c.parents.length === 0 || (i === files.length - 1 && h % 4 === 0) ? "added" : "modified";
    return delay(files.map((f, i) => fakeFile(f, h + i, c.summary, status(i))));
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

  set_git_path({ gitPath }) {
    // Nothing runs in the demo; accept anything that looks like a git binary.
    if (gitPath && !/git(\.exe)?$/i.test(gitPath)) return fail(`'${gitPath}' is not a git executable`);
    return delay("git version 2.47.0 (demo)");
  },
  git_version() {
    if (demoControls.gitMissing) return fail("Can't run 'git': No such file or directory (os error 2)");
    return delay("git version 2.47.0 (demo)");
  },
  report_send({ report }) {
    demoControls.sent.push(report);
    if (demoControls.reportFail === "limited") return fail("Too many reports. Try again later.");
    if (demoControls.reportFail === "offline")
      return fail("Couldn't reach ddugit.com: io: failed to lookup address information");
    return delay(`demo-${demoControls.sent.length}`);
  },
  app_info: () => delay({ version: `${appVersion}-demo`, os: "demo", osVersion: navigator.platform, arch: "web" }),

  git_rebase_todo({ base }) {
    const head = repo.branches.get(repo.head)!;
    if (!repo.ancestors(head).has(base)) return fail(`${base} is not an ancestor of HEAD`);
    return delay(todoFor(base, head));
  },

  git_rebase({ base, steps }) {
    if (repo.state !== "clean") return fail("Repository is in the middle of an operation");
    const head = repo.branches.get(repo.head)!;
    const inBase = repo.ancestors(base);
    if ([...repo.ancestors(head)].some((id) => !inBase.has(id) && repo.commits.get(id)!.parents.length > 1)) {
      // Merges in the range: replay git's todo with the plan, like `rebase -i --rebase-merges`.
      const todo = todoFor(base, head);
      const picks = todo.flatMap((x) => (x.kind === "pick" ? [x.id] : [])).sort();
      if (
        picks.join() !==
        steps
          .map((s) => s.id)
          .sort()
          .join()
      )
        return fail("The plan must list every commit after the base exactly once");
      const labels = new Map([["onto", base]]);
      let tip = base;
      for (const item of applyPlan(todo, steps)) {
        if (item.kind === "label") labels.set(item.name, tip);
        else if (item.kind === "reset") tip = labels.get(item.to) ?? item.to;
        else if (item.kind === "merge") tip = repo.commit([tip, labels.get(item.label) ?? item.label], item.summary);
        else if (item.action === "pick") tip = repo.commit([tip], item.summary, repo.commits.get(item.id)!.author);
        else if (item.action === "squash") repo.commits.get(tip)!.message += `\n${repo.commits.get(item.id)!.message}`;
      }
      repo.branches.set(repo.head, tip);
      return delay(res("ok", `Successfully rebased and updated refs/heads/${repo.head}.`));
    }
    // Rebuild the branch on `base`: squash / fixup fold into the previous commit.
    let tip = base;
    for (const s of steps) {
      const c = repo.commits.get(s.id);
      if (!c) return fail(`Unknown commit ${s.id}`);
      if (s.action === "drop") continue;
      if (s.action === "pick") tip = repo.commit([tip], c.summary, c.author);
      else {
        const prev = repo.commits.get(tip)!;
        if (s.action === "squash") prev.message += `\n${c.message}`;
      }
    }
    repo.branches.set(repo.head, tip);
    return delay(res("ok", `Successfully rebased and updated refs/heads/${repo.head}.`));
  },

  // Patch equivalence is approximated by equal summaries.
  backport_compare({ source, target }) {
    const [src, tgt] = [repo.resolve(source), repo.resolve(target)];
    if (!src) return fail(`Unknown branch or commit '${source}'`);
    if (!tgt) return fail(`Unknown branch or commit '${target}'`);
    const [inSrc, inTgt] = [repo.reach(src), repo.reach(tgt)];
    const only = (a: Set<string>, b: Set<string>) =>
      repo.order.map((id) => repo.commits.get(id)!).filter((c) => a.has(c.id) && !b.has(c.id) && c.parents.length < 2);
    const ported = new Set(only(inTgt, inSrc).map((c) => c.summary));
    return delay(
      only(inSrc, inTgt).map((c): BackportItem => ({
        id: c.id,
        summary: c.summary,
        author: c.author,
        time: c.time,
        state: ported.has(c.summary)
          ? { kind: "applied" }
          : repo.backportIgnored.get(target)?.has(c.id)
            ? { kind: "ignored" }
            : { kind: "missing" },
      })),
    );
  },

  backport_ignore({ target, id, ignore }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    const set = repo.backportIgnored.get(target) ?? new Set<string>();
    if (ignore) set.add(id);
    else set.delete(id);
    repo.backportIgnored.set(target, set);
    return delay(null);
  },

  async backport_summary({ path, source, targets }) {
    const out = [];
    for (const target of targets.filter((t) => t !== source)) {
      const items = await mock.backport_compare({ path, source, target });
      const n = (k: string) => items.filter((i) => i.state.kind === k).length;
      out.push({ target, missing: n("missing"), applied: n("applied") + n("picked"), ignored: n("ignored") });
    }
    return out;
  },

  backport_apply({ ids, target }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    if (!repo.branches.has(target)) return fail(`Unknown branch '${target}'`);
    repo.head = target;
    if (demoControls.emptyNext) {
      // The first commit's change is already on the target: git stops with nothing to commit.
      demoControls.emptyNext = false;
      repo.state = "cherry-pick";
      repo.skipRest = ids.slice(1).map((id) => repo.commits.get(id)?.summary ?? id);
      return delay(res("empty", "The previous cherry-pick is now empty, possibly due to conflict resolution."));
    }
    for (const id of ids) repo.add(target, repo.commits.get(id)?.summary ?? id);
    return delay(res("ok"));
  },

  backport_export({ ids, outDir }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    const name = (id: string, i: number) =>
      `${outDir}/${String(i + 1).padStart(4, "0")}-${(repo.commits.get(id)?.summary ?? id).replace(/\W+/g, "-")}.patch`;
    return delay(res("ok", ids.map(name).join("\n")));
  },

  worktree_diff({ file, scope }) {
    const inScope = (c: FileChange) => scope === "all" || (scope === "staged" ? !!c.staged : !!c.unstaged);
    const list = repo.changes.filter((c) => (!file || c.path === file) && inScope(c));
    return delay(list.map((c) => fakeFile(c.path, hash(c.path), "work in progress", c.unstaged ?? c.staged ?? "")));
  },

  branch_report() {
    const base = repo.branches.has("main") ? "main" : repo.head;
    const inBase = repo.ancestors(repo.branches.get(base)!);
    const branches = [...repo.branches]
      .filter(([name]) => name !== base && name !== repo.head)
      .map(([name, tip]) => ({
        name,
        tip,
        time: repo.commits.get(tip)!.time,
        merged: inBase.has(tip),
        gone: demoControls.goneBranches.includes(name),
        upstream: repo.remotes.has(`origin/${name}`) ? `origin/${name}` : null,
      }))
      .sort((a, b) => a.time - b.time);
    return delay({ base, branches });
  },

  git_delete_branches({ names, force }) {
    const base = repo.ancestors(repo.branches.get("main") ?? repo.branches.get(repo.head)!);
    const unmerged = names.filter((n) => !base.has(repo.branches.get(n) ?? ""));
    if (!force && unmerged.length)
      return delay(res("unmerged", `error: the branch '${unmerged[0]}' is not fully merged.`));
    for (const n of names) repo.branches.delete(n);
    return delay(res("ok", names.map((n) => `Deleted branch ${n}`).join("\n")));
  },

  git_edit_commit({ id, edit }) {
    if (repo.state !== "clean") return fail("Finish or cancel the operation in progress first");
    // First-parent chain from HEAD down to `id`, then rebuilt upwards.
    const chain: string[] = [];
    for (let c: string | undefined = repo.branches.get(repo.head); c !== id; c = repo.commits.get(c!)?.parents[0]) {
      if (!c) return fail("The commit isn't on the current branch");
      chain.unshift(c);
    }
    const old = repo.commits.get(id)!;
    const copy = (src: string, parent: string | undefined, over: Partial<CommitInfo> = {}) => {
      const c = repo.commits.get(src)!;
      const nid = repo.commit(
        parent ? [parent, ...c.parents.slice(1)] : [],
        over.summary ?? c.summary,
        over.author ?? c.author,
      );
      repo.commits.set(nid, { ...repo.commits.get(nid)!, ...over, id: nid, time: c.time });
      return nid;
    };
    let tip: string;
    if (edit.kind === "reword") {
      const summary = edit.message.split("\n")[0];
      tip = copy(id, old.parents[0], { summary, message: edit.message });
    } else if (edit.kind === "author") tip = copy(id, old.parents[0], { author: edit.name, email: edit.email });
    else {
      const first = copy(id, old.parents[0], { summary: edit.firstMessage.split("\n")[0], message: edit.firstMessage });
      tip = copy(id, first, { summary: edit.secondMessage.split("\n")[0], message: edit.secondMessage });
    }
    for (const c of chain) tip = copy(c, tip);
    repo.branches.set(repo.head, tip);
    return delay(res("ok"));
  },

  git_restore_file({ file }) {
    repo.changes = repo.changes.filter((c) => c.path !== file);
    repo.changes.push({ path: file, staged: "modified", unstaged: null, conflicted: false });
    return delay(res("ok"));
  },

  git_bisect({ op }) {
    if (op.kind === "start") {
      if (!repo.ancestors(op.bad).has(op.good)) return fail("The good commit must be an ancestor of the bad one");
      repo.bisect = { bad: op.bad, good: [op.good], skipped: [] };
      return delay(res("ok", "Bisecting"));
    }
    const b = repo.bisect;
    const probe = b && mockBisect().current;
    if (!b || !probe) return fail("Not bisecting");
    if (op.kind === "good") b.good.push(probe);
    else if (op.kind === "bad") b.bad = probe;
    else b.skipped.push(probe);
    return delay(res("ok"));
  },

  bisect_state: () => delay(repo.bisect ? mockBisect() : null),
  license_status: () => Promise.resolve(demoLicenseStatus()),
  license_install({ text }) {
    if (!text.trim().startsWith("DDUGIT1.")) return Promise.reject("This is not a ddugit license");
    return Promise.resolve(
      putDemoLicense({
        id: "lic_demo",
        name: "Demo Corp",
        email: "it@demo.example",
        kind: "commercial",
        seats: 5,
        issued: "2026-10-02",
        updatesUntil: "2027-10-02",
      }),
    );
  },
  async license_activate() {
    const ticket = ++demoActivation.n;
    await delay(null, 900);
    if (ticket !== demoActivation.n) return Promise.reject("Cancelled");
    return putDemoLicense({ ...DEMO_LIFETIME });
  },
  license_activate_cancel() {
    demoActivation.n++;
    return delay(undefined, 0);
  },
  license_deactivate() {
    return delay({ status: putDemoLicense(null), confirmed: !demoControls.offline });
  },
  license_refresh() {
    const lic = demoLicense.current;
    if (!lic) return Promise.reject("No license on this computer");
    if (!lic.device || !demoControls.deviceRemoved) return delay("current" as const);
    putDemoLicense(null);
    return delay("removed" as const);
  },
  license_remove: () => Promise.resolve(putDemoLicense(null)),
  update_check: () => delay(demoControls.update),
  update_install() {
    demoControls.update = null;
    return delay(null);
  },
  ssh_status() {
    return Promise.resolve({ available: true, keys: demoSsh.keys.slice() });
  },
  ssh_keygen({ comment }) {
    const key = {
      name: "id_ed25519",
      public: `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDemoKeyForTheDdugitTour ${comment}`,
    };
    demoSsh.keys = [key];
    return Promise.resolve(key);
  },
  ssh_host_key({ url }) {
    const host = url.replace(/^.*@/, "").replace(/[:/].*$/, "");
    return Promise.resolve({
      host,
      port: null,
      known: demoSsh.trusted.includes(host),
      fingerprints: ["SHA256:+DiY3wvvV6TuJJhbpZisF/zLDA0zPMSvHdkr4UvCOqU"],
      verified: host === "github.com" ? true : null,
    });
  },
  ssh_trust_host({ url }) {
    demoSsh.trusted.push(url.replace(/^.*@/, "").replace(/[:/].*$/, ""));
    return Promise.resolve(null);
  },
  ssh_test() {
    return Promise.resolve(
      demoSsh.keys.length
        ? { ok: true, user: "demo", output: "Hi demo! You've successfully authenticated." }
        : { ok: false, user: null, output: "git@github.com: Permission denied (publickey)." },
    );
  },
  pro_status: () => delay(demoControls.pro),
  batch_switch({ path, branch }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    const g = demoGlance(path);
    if (g.error) return fail(g.error);
    if (g.state !== "clean") return fail(`Repository is in the middle of a ${g.state}; finish or abort it first`);
    const how = g.branch === branch ? "already" : GLANCE_BRANCHES.includes(branch) ? "tracked" : "created";
    const upstream = how === "created" ? null : `origin/${branch}`;
    demoWorlds.set(path, { ...demoWorlds.get(path), branch, upstream, ahead: 0, behind: 0 });
    return delay({ result: res("ok", `Switched to branch '${branch}'`), how } as const);
  },
  release_range({ from, to }) {
    const end = repo.resolve(to);
    if (!end) return fail(`unknown revision '${to}'`);
    const behind = repo.ancestors(end);
    const time = (id: string) => repo.commits.get(id)?.time ?? 0;
    const tags = [...repo.tags]
      .filter(([, id]) => behind.has(id))
      .sort((a, b) => time(b[1]) - time(a[1]))
      .map(([name]) => name);
    // Like `describe --tags <to>^`: the newest tag strictly behind the end.
    const start = from === "" ? null : (from ?? tags.find((name) => repo.tags.get(name) !== end) ?? null);
    const stop = start ? repo.ancestors(repo.resolve(start)!) : new Set<string>();
    const commits: import("./types").NoteCommit[] = [];
    for (let id: string | undefined = end; id && !stop.has(id); id = repo.commits.get(id)?.parents[0]) {
      const c = repo.commits.get(id)!;
      const note = (id: string) => {
        const c = repo.commits.get(id)!;
        return { id, author: c.author, time: c.time, summary: demoConventional(c.summary), body: "", inner: [] };
      };
      // A merge also carries what it brought in (the second parent's own commits).
      const [first, second] = c.parents;
      const mainline = second ? repo.ancestors(first) : new Set<string>();
      const inner = second
        ? [...repo.ancestors(second)]
            .filter((x) => !mainline.has(x) && repo.commits.get(x)!.parents.length < 2)
            .sort((a, b) => time(b) - time(a))
            .map(note)
        : [];
      commits.push({ ...note(id), inner });
    }
    return delay({ from: start, commits, tags, truncated: false });
  },
  stack_list: () => delay(demoStackList()),
  stack_op({ op }) {
    if (op.kind !== "remove" && !demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    switch (op.kind) {
      case "create": {
        const at = repo.branches.get(op.parent);
        if (!at) return fail(`No local branch '${op.parent}'`);
        if (repo.branches.has(op.name)) return fail(`Branch '${op.name}' already exists`);
        repo.branches.set(op.name, at);
        repo.head = op.name;
        demoStacks.set(op.name, { parent: op.parent, base: at });
        return delay(res("ok"));
      }
      case "setParent": {
        for (let p: string | undefined = op.parent; p; p = demoStacks.get(p)?.parent)
          if (p === op.branch) return fail(`'${op.parent}' is stacked on '${op.branch}'`);
        const mine = repo.ancestors(repo.branches.get(op.branch)!);
        const below = repo.ancestors(repo.branches.get(op.parent)!);
        const old = demoStacks.get(op.branch)?.base;
        // Off a vanished parent: keep the old base; otherwise the fork point.
        const base = old && mine.has(old) ? old : repo.order.find((id) => mine.has(id) && below.has(id))!;
        demoStacks.set(op.branch, { parent: op.parent, base });
        return delay(res("ok"));
      }
      case "remove":
        demoStacks.delete(op.branch);
        return delay(res("ok"));
      case "restack": {
        const r = demoRestack(op.branch);
        return typeof r === "string" ? fail(r) : delay(r);
      }
    }
  },
  transfer_history: () => delay([...demoTransfers]),
  transfer_export({ req }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    if (!req.branches.length) return Promise.reject("Pick at least one branch");
    const fresh = req.branches.filter(
      (b) => req.full || demoTransfers.find((s) => s.dest === req.dest && s.branch === b)?.tip !== repo.branches.get(b),
    );
    if (!fresh.length) return Promise.reject(`Nothing new for ${req.dest} since the last transfer`);
    const time = Math.floor(Date.now() / 1000);
    for (const b of fresh) {
      const i = demoTransfers.findIndex((s) => s.dest === req.dest && s.branch === b);
      const s = { dest: req.dest, branch: b, tip: repo.branches.get(b)!, time };
      if (i >= 0) demoTransfers[i] = s;
      else demoTransfers.push(s);
    }
    return delay(res("ok", `${req.outDir}/demo-${req.dest.replace(/\W+/g, "-")}-2026-10-04-120000.bundle`));
  },
  transfer_check: () =>
    delay({
      ok: true,
      checksum: "match" as const,
      heads: ["main", "feature/theme"].map((b) => ({ name: `refs/heads/${b}`, id: repo.branches.get(b)! })),
      missing: [],
    }),
  transfer_import({ name }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    for (const b of ["main", "feature/theme"]) repo.remotes.set(`${name}/${b}`, repo.branches.get(b)!);
    return delay(res("ok"));
  },
  pull_requests() {
    const token = demoControls.forgeToken;
    // The demo repository counts as private: without Pro its pull requests stay closed.
    const locked = !demoControls.pro.pro;
    const ok = !locked && (token === "cli" || token === "keychain");
    const tip = (b: string) => repo.branches.get(b)!;
    type Open = Pick<PullRequest, "number" | "branch" | "title" | "draft" | "author" | "checks" | "review">;
    const prs: PullRequest[] = ok
      ? (
          [
            {
              number: 12,
              branch: "feature/theme",
              title: "Warmer theme glow",
              draft: false,
              author: "seoyeon",
              checks: "success" as const,
              review: "approved" as const,
            },
            {
              number: 15,
              branch: "hotfix/crash",
              title: "Fix crash on empty repo",
              draft: true,
              author: "hyunwoo",
              checks: "failure" as const,
              review: null,
            },
          ] as Open[]
        )
          .concat(demoNewPrs.map((p) => ({ ...p, author: "stella", checks: "pending" as const, review: null })))
          .filter((p) => repo.branches.has(p.branch))
          .map((p): PullRequest => ({
            ...p,
            remote: "origin",
            sha: tip(p.branch),
            state: "open" as const,
            url: `https://github.com/ddugit/ddugit-demo/pull/${p.number}`,
          }))
          .concat(
            // Done ones: one merged into main (its head is main's tip), one closed whose head is gone.
            [
              { number: 9, title: "Minimap", state: "merged" as const, sha: tip("main") },
              { number: 4, title: "Try WebGL lanes", state: "closed" as const, sha: "0".repeat(40) },
            ].map((p): PullRequest => ({
              ...p,
              remote: "origin",
              branch: `feature/${p.number}`,
              draft: false,
              author: "jimin",
              checks: null,
              review: null,
              url: `https://github.com/ddugit/ddugit-demo/pull/${p.number}`,
            })),
          )
      : [];
    return delay({
      forges: [
        {
          remote: "origin",
          kind: "github" as const,
          host: "github.com",
          slug: "ddugit/ddugit-demo",
          token: token === "unauthorized" ? ("keychain" as const) : token,
          public: true,
          unauthorized: token === "unauthorized",
          locked,
          error: null,
        },
      ],
      prs,
    });
  },
  pr_target({ remote }) {
    const token = demoControls.forgeToken;
    const connected = token === "cli" || token === "keychain";
    return delay({
      remote,
      kind: "github" as const,
      host: "github.com",
      slug: "ddugit/ddugit-demo",
      token: token === "unauthorized" ? ("keychain" as const) : token,
      public: true,
      needsToken: !connected,
      unauthorized: token === "unauthorized",
      // The demo repository counts as private (see `pull_requests`).
      locked: connected && !demoControls.pro.pro,
      defaultBranch: connected ? "main" : null,
    });
  },
  pr_create({ remote, req }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    if (demoControls.forgeToken === "none" || demoControls.forgeToken === "unauthorized")
      return delay({ kind: "refused" as const, message: "Bad credentials" });
    const open = demoOpenPr(req.head);
    const url = (n: number) => `https://github.com/ddugit/ddugit-demo/pull/${n}`;
    if (open) return delay({ kind: "exists" as const, number: open.number, url: url(open.number) });
    if (!repo.remotes.has(`${remote}/${req.head}`)) return fail("head invalid");
    const number = 16 + demoNewPrs.length;
    demoNewPrs.push({ number, branch: req.head, title: req.title, draft: req.draft });
    return delay({ kind: "created" as const, number, url: url(number) });
  },
  set_forge_token({ host, token }) {
    demoControls.forgeToken = token ? "keychain" : "none";
    if (token) demoForgeHosts.add(host);
    else demoForgeHosts.delete(host);
    return delay(null);
  },
  forge_repos({ kind, host, trusted }) {
    host = host
      .trim()
      .replace(/^[a-z]+:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (!host) return fail("Not a host name");
    // github.com answers through the demo's `gh` login; any other host needs a token pasted (or trusted) first.
    const signedIn = host === "github.com" || demoForgeHosts.has(host) || trusted.includes(host);
    const day = 86_400_000;
    const repos = signedIn
      ? DEMO_FORGE_REPOS.map(([fullName, description, isPrivate, days]) => ({
          fullName,
          description,
          private: isPrivate,
          httpsUrl: `https://${host}/${fullName}.git`,
          sshUrl: `git@${host}:${fullName}.git`,
          updated: new Date(Date.now() - days * day).toISOString(),
        }))
      : [];
    return delay({
      kind,
      host,
      token: host === "github.com" ? ("cli" as const) : signedIn ? ("keychain" as const) : ("none" as const),
      public: host === "github.com" || host === "gitlab.com",
      needsToken: !signedIn,
      unauthorized: false,
      user: signedIn ? "stella" : null,
      repos,
    });
  },
  open_url({ url }) {
    window.open(url, "_blank", "noopener");
    return delay(null);
  },
  file_log({ rev, file }) {
    const tip = (rev === "HEAD" ? repo.branches.get(repo.head) : repo.branches.get(rev)) ?? rev;
    if (!repo.commits.has(tip)) return fail(`Unknown revision ${rev}`);
    const seen = repo.ancestors(tip);
    return delay(
      repo.order.filter((id) => seen.has(id) && filesOf(id).includes(file)).map((id) => ({ id, path: file })),
    );
  },
  async git_blame({ path, rev, file }) {
    const touches = await mockTable.file_log({ path, rev, file });
    if (!touches.length) return fail(`'${file}' is not in ${rev.slice(0, 7)}`);
    // A few hunks per commit that touched it, oldest at the top like a file that grew downward.
    const lines: string[] = [];
    const hunks: Blame["hunks"] = [];
    for (const [i, t] of [...touches].reverse().entries()) {
      const c = repo.commits.get(t.id)!;
      const len = 2 + (hash(t.id) % 5);
      hunks.push({ commit: c.id, start: lines.length, len, author: c.author, time: c.time, summary: c.summary });
      lines.push(`// ${c.summary}`, ...Array.from({ length: len - 1 }, (_, k) => `const v${i}_${k} = ${k * i};`));
    }
    return delay({ lines, hunks });
  },

  git_reset({ target, mode }) {
    if (repo.state !== "clean") return fail("Finish or cancel the operation in progress first");
    const tip = repo.branches.get(repo.head)!;
    const dest = repo.resolve(target);
    if (!dest) return fail(`unknown revision '${target}'`);
    const passed = [...repo.ancestors(tip)].filter((id) => !repo.ancestors(dest).has(id));
    repo.branches.set(repo.head, dest);
    if (mode === "hard") repo.changes = [];
    else
      for (const id of passed) {
        const file = `${repo.commits.get(id)!.summary.toLowerCase().replace(/\W+/g, "-")}.txt`;
        repo.changes.push({
          path: file,
          staged: mode === "soft" ? "modified" : null,
          unstaged: mode === "soft" ? null : "modified",
          conflicted: false,
        });
      }
    return delay(res("ok"));
  },

  git_reflog({ limit }) {
    const reach = new Set<string>();
    for (const t of [...repo.branches.values(), ...repo.remotes.values(), ...repo.tags.values()])
      for (const id of repo.ancestors(t)) reach.add(id);
    return delay(repo.reflog.slice(0, limit ?? 100).map((e) => ({ ...e, lost: !reach.has(e.id) })));
  },
};

/** Every command, then a reflog entry if it moved HEAD (named like git's). */
export const mock = Object.fromEntries(
  Object.entries(mockTable).map(([name, f]) => [
    name,
    async (args: never) => {
      const r = await (f as (a: never) => Promise<unknown>)(args);
      repo.noteHead(name.replace(/^git_/, "").replace(/_/g, " "));
      return r;
    },
  ]),
) as Table;
repo.noteHead("checkout: demo");
