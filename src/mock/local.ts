// Demo commands for the working tree: snapshot, commits, identity and signing, stashes, conflicts, diffs and staging.

import type { Args } from "../api";
import type { FileChange, Identity, IdentityOp, OpResult, Signature } from "../types";
import { demoControls } from "./controls";
import { DEMO_BINARY, stopOnConflict } from "./history";
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
/** What git prints when signing a commit fails (`signFail`). */
const SIGN_FAILURES = {
  gpg: "error: gpg failed to sign the data\nfatal: failed to write commit object",
  ssh: 'error: Load key "/home/pilot/.ssh/id_ed25519": incorrect passphrase supplied to decrypt private key?\nfatal: failed to write commit object',
};

/** Whether a `.gitignore` pattern of the kinds the app writes (`/path`, `/dir/`, `*.ext`) covers `path`. */
function demoIgnores(pattern: string, path: string) {
  const p = pattern.replace(/\\(.)/g, "$1");
  if (p.startsWith("*.")) return path.endsWith(p.slice(1));
  const anchored = p.replace(/^\//, "");
  return anchored.endsWith("/") ? path.startsWith(anchored) : path === anchored;
}

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
    const sign = demoControls.signFail;
    if (sign) {
      demoControls.signFail = null;
      return delay(res("failed", SIGN_FAILURES[sign]));
    }
    if (demoControls.preCommitFails && !args.options.noVerify)
      return delay(res("failed", "lint: 2 problems (no-unused-vars)\nhusky - pre-commit hook exited with code 1"));
    const r = await demoCommit(args);
    const id = demoReadIdentity(args.path);
    if (r.status === "ok") {
      if (id.sign?.value && id.key) demoSigned.add(repo.branches.get(repo.head)!);
      const trailer = `Signed-off-by: ${id.name?.value} <${id.email?.value}>`;
      demoControls.lastMessage = args.options.signoff ? `${args.message}\n\n${trailer}` : args.message;
    }
    return r;
  },
  commit_template: () => delay(demoControls.commitTemplate, 20),
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

  git_stash_push({ message, paths, options }) {
    const set = new Set(paths.length ? paths : repo.changes.map((c) => c.path));
    const isUntracked = (c: FileChange) => c.unstaged === "untracked" && !c.staged;
    const moved = repo.changes.filter((c) => set.has(c.path) && (options.untracked || !isUntracked(c)));
    if (!moved.length) return fail("No local changes to save");
    // `--keep-index` leaves what was staged in place (staged); the rest goes into the stash.
    repo.changes = repo.changes.flatMap((c) =>
      !moved.includes(c) ? [c] : options.keepIndex && c.staged ? [{ ...c, unstaged: null }] : [],
    );
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
    // Like `git stash pop` that conflicts: the files stop in conflict and the stash is kept.
    if (op !== "drop" && demoControls.conflictNext) return stopOnConflict("clean", st.id, "Stashed changes");
    if (op !== "drop") {
      const have = new Set(repo.changes.map((c) => c.path));
      repo.changes.push(...st.changes.filter((c) => !have.has(c.path)));
    }
    if (op !== "apply") repo.stashes.splice(index, 1);
    return delay(res("ok"));
  },

  git_stash_branch({ id, name }) {
    const index = repo.stashes.findIndex((s) => s.id === id);
    const st = repo.stashes[index];
    if (!st) return fail("That stash no longer exists; the list has been refreshed");
    if (repo.branches.has(name)) return fail(`Branch '${name}' already exists`);
    if (repo.changes.length) return fail("error: Your local changes would be overwritten by checkout.");
    repo.branches.set(name, st.base);
    repo.head = name;
    repo.changes = st.changes.map((c) => ({ ...c }));
    repo.stashes.splice(index, 1);
    return delay(res("ok", `Switched to a new branch '${name}'\nDropped ${id}`));
  },

  git_stage_files({ paths, unstage }) {
    const set = new Set(paths);
    for (const c of repo.changes) {
      if (paths.length && !set.has(c.path)) continue;
      const kind = c.unstaged ?? c.staged ?? "modified";
      if (!unstage && c.unstaged) Object.assign(c, { staged: kind === "untracked" ? "added" : kind, unstaged: null });
      if (unstage && c.staged) Object.assign(c, { staged: null, unstaged: kind === "added" ? "untracked" : kind });
    }
    return delay(res("ok"));
  },

  git_discard_hunks({ file }) {
    // Demo files have one hunk: discarding it (or some of its lines) drops the file's unstaged change.
    const c = repo.changes.find((x) => x.path === file && x.unstaged);
    if (!c) return fail(`No changes to '${file}'`);
    repo.changes = c.staged
      ? repo.changes.map((x) => (x === c ? { ...x, unstaged: null } : x))
      : repo.changes.filter((x) => x !== c);
    return delay(res("ok"));
  },

  git_ignore({ patterns, untrack }) {
    const fresh = patterns.filter((p) => !repo.gitignore.includes(p));
    if (fresh.length && !repo.gitignore.length && !repo.changes.some((c) => c.path === ".gitignore"))
      repo.changes.push({ path: ".gitignore", staged: null, unstaged: "untracked", conflicted: false });
    repo.gitignore.push(...new Set(fresh));
    const ignored = (path: string) => repo.gitignore.some((p) => demoIgnores(p, path));
    const gone = new Set(untrack);
    repo.changes = repo.changes.filter((c) => gone.has(c.path) || !(c.unstaged === "untracked" && ignored(c.path)));
    for (const path of untrack) {
      const now = { path, staged: "deleted", unstaged: ignored(path) ? null : "untracked", conflicted: false };
      repo.changes = [...repo.changes.filter((c) => c.path !== path), now];
    }
    return delay(res("ok"));
  },

  conflict_file({ file }) {
    const merged = repo.pending?.files.get(file);
    if (merged === undefined) return fail(`'${file}' is not in conflict`);
    if (merged === DEMO_BINARY)
      return delay({ path: file, base: null, ours: null, theirs: null, merged: "", binary: true });
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

  range_diff({ from, to, mergeBase }) {
    const unknown = [from, to].find((id) => !repo.commits.has(id));
    if (unknown) return fail(`Unknown commit ${unknown}`);
    // The files the commits between the two touched (from the merge base: only `to`'s side).
    const [a, b] = [repo.ancestors(from), repo.ancestors(to)];
    const between = [...b].filter((id) => !a.has(id)).concat(mergeBase ? [] : [...a].filter((id) => !b.has(id)));
    const files = [...new Set(between.flatMap(filesOf))].sort();
    return delay(files.map((f) => fakeFile(f, hash(f + from + to), `${from.slice(0, 7)} → ${to.slice(0, 7)}`)));
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
