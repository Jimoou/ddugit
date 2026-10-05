// Demo commands for the working tree: snapshot, commits, identity and signing, stashes, conflicts, diffs and staging.

import type { Args } from "../api";
import type { FileChange, Identity, IdentityOp, OpResult, Signature } from "../types";
import { demoControls } from "./controls";
import { type Table, delay, fail, fakeFile, fakeId, filesOf, hash, repo, res } from "./repo";

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

/** A commit in the demo (signing is noted by `git_commit`). */
function demoCommit({ message, paths, amend, stagedOnly }: Args<"git_commit">): Promise<OpResult> {
  if (!message.trim()) return fail("Commit message is empty");
  if (repo.pending) {
    // Concluding a merge: needs every conflict resolved, then a two-parent commit.
    if (repo.changes.some((c) => c.conflicted))
      return fail("Committing is not possible because you have unmerged files.");
    // A merge commit has two parents; a stopped cherry-pick or revert makes a plain commit.
    repo.add(repo.head, message.split("\n")[0], repo.pending.summary ? [] : [repo.pending.source]);
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

export const localCommands = {
  repo_snapshot: ({ limit }) => delay(repo.snapshot(limit)),
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

  git_stash({ op, id }) {
    const index = repo.stashes.findIndex((s) => s.id === id);
    const st = repo.stashes[index];
    if (!st) return fail("That stash no longer exists; the list has been refreshed");
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

  worktree_diff({ file, scope }) {
    const inScope = (c: FileChange) => scope === "all" || (scope === "staged" ? !!c.staged : !!c.unstaged);
    const list = repo.changes.filter((c) => (!file || c.path === file) && inScope(c));
    return delay(list.map((c) => fakeFile(c.path, hash(c.path), "work in progress", c.unstaged ?? c.staged ?? "")));
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

  git_restore_file({ file }) {
    repo.changes = repo.changes.filter((c) => c.path !== file);
    repo.changes.push({ path: file, staged: "modified", unstaged: null, conflicted: false });
    return delay(res("ok"));
  },
} satisfies Partial<Table>;
