// Demo commands that reach a remote: fetch, pull, push, pull requests, forge repositories and SSH.

import type { CommitInfo, OpResult, PullRequest, RemoteOp } from "../types";
import { demoGlance, demoWorlds } from "./app";
import { PRO_LOCKED, demoControls } from "./controls";
import { type Table, delay, fail, repo, res } from "./repo";

/** The demo's SSH state: keys made and hosts trusted in this session. */
const demoSsh = { keys: [] as { name: string; public: string }[], trusted: [] as string[] };
export function pull(mode: "ff" | "merge" | "rebase"): OpResult | string {
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

export const AUTH_OUTPUT = {
  https: "fatal: could not read Username for 'https://github.com': terminal prompts disabled",
  ssh: "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.",
};

export const PHASES = {
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

export const remoteCommands = {
  async git_push_to({ remote: name, branch, force, onProgress }) {
    if (repo.fetchOnly.has(name)) return fail(`${name} is fetch-only`);
    const b = branch ?? repo.head;
    if (!repo.branches.has(b)) return fail(`Unknown branch '${b}'`);
    const refused = demoControls.rejectNextPush;
    if (refused && !force) {
      demoControls.rejectNextPush = null;
      return delay(res("rejected", refused));
    }
    for (let pct = 0; pct <= 100; pct += 25) {
      onProgress.onmessage({ phase: "Writing objects", percent: pct });
      await delay(null, 40);
    }
    repo.remotes.set(`${name}/${b}`, repo.branches.get(b)!);
    repo.tracking.set(b, `${name}/${b}`);
    return res("ok", `branch '${b}' set up to track '${name}/${b}'.`);
  },

  async git_remote_ref({ remote: name, op, onProgress }) {
    if (repo.fetchOnly.has(name)) return fail(`${name} is fetch-only`);
    const fake = demoControls.failNextRemote;
    if (fake) {
      demoControls.failNextRemote = null;
      return delay(res("auth", AUTH_OUTPUT[fake]));
    }
    onProgress.onmessage({ phase: "Writing objects", percent: 100 });
    await delay(null, 40);
    if (op.kind === "deleteBranch") {
      const ref = `${name}/${op.name}`;
      if (!repo.remotes.has(ref))
        return res("failed", `error: unable to delete '${op.name}': remote ref does not exist`);
      repo.remotes.delete(ref);
      for (const [local, up] of repo.tracking) if (up === ref) repo.tracking.delete(local);
      return res("ok", ` - [deleted]         ${op.name}`);
    }
    if (op.kind === "deleteTag") {
      if (!repo.remoteTags.delete(`${name}/${op.name}`))
        return res("failed", `error: unable to delete '${op.name}': remote ref does not exist`);
      return res("ok", ` - [deleted]         ${op.name}`);
    }
    const tags = op.kind === "pushTags" ? [...repo.tags.keys()] : [op.name];
    const lines: string[] = [];
    for (const tag of tags) {
      const id = repo.tags.get(tag);
      if (!id) return res("failed", `error: src refspec refs/tags/${tag} does not match any`);
      const there = repo.remoteTags.get(`${name}/${tag}`);
      if (there && there !== id) return res("rejected", ` ! [rejected]        ${tag} -> ${tag} (already exists)`);
      if (!there) lines.push(` * [new tag]         ${tag} -> ${tag}`);
      repo.remoteTags.set(`${name}/${tag}`, id);
    }
    return res("ok", lines.join("\n") || "Everything up-to-date");
  },

  async git_remote({ path, op, onProgress }) {
    // A dashboard world (not the demo tab, api.ts's DEMO_PATH): pull fast-forwards, or reports it can't.
    if (path !== "demo" && op === "pull") {
      const g = demoGlance(path);
      if (g.ahead && g.behind) return delay(res("diverged", "fatal: Not possible to fast-forward, aborting."));
      demoWorlds.set(path, { ...demoWorlds.get(path), behind: 0 });
      return delay(res("ok", g.behind ? "Fast-forward" : "Already up to date."));
    }
    if (demoControls.slow) await delay(null, demoControls.slow);
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
    const refused = demoControls.rejectNextPush;
    if (refused && op === "push") {
      demoControls.rejectNextPush = null;
      return res("rejected", refused);
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
  forge_repos({ kind, host }) {
    host = host
      .trim()
      .replace(/^[a-z]+:\/\//i, "")
      .replace(/\/.*$/, "")
      .toLowerCase();
    if (!host) return fail("Not a host name");
    // github.com answers through the demo's `gh` login; any other host needs a token pasted first.
    const signedIn = host === "github.com" || demoForgeHosts.has(host);
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
} satisfies Partial<Table>;
