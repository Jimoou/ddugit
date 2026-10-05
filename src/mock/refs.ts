// Demo commands for refs and checkouts: branches, tags, remotes, worktrees, submodules and LFS.

import { demoControls } from "./controls";
import { demoStacks } from "./pro";
import { DEMO_ROOT, type Table, delay, fail, repo, res } from "./repo";

/** The demo's LFS: two patterns, three files whose content isn't downloaded yet. */
const demoLfs = {
  patterns: ["*.psd", "assets/**/*.png"],
  filters: true,
  missing: ["art/cover.psd", "assets/hero.png", "assets/nebula.png"],
};

export const refsCommands = {
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

  git_create_branch({ name, at, switch: sw }) {
    if (repo.branches.has(name)) return fail(`Branch '${name}' already exists`);
    repo.branches.set(name, at ?? repo.branches.get(repo.head)!);
    if (sw) repo.head = name;
    return delay(res("ok"));
  },

  git_delete_branches({ names, force }) {
    const base = repo.ancestors(repo.branches.get("main") ?? repo.branches.get(repo.head)!);
    const unmerged = names.filter((n) => !base.has(repo.branches.get(n) ?? ""));
    if (!force && unmerged.length)
      return delay(res("unmerged", `error: the branch '${unmerged[0]}' is not fully merged.`));
    for (const n of names) repo.branches.delete(n);
    return delay(res("ok", names.map((n) => `Deleted branch ${n}`).join("\n")));
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
} satisfies Partial<Table>;
