// Demo commands of the Pro features: backport, release notes, stacked branches and air-gapped transfer.

import type { BackportItem, NoteCommit, OpResult, StackBranch, TransferSent } from "../types";
import { PRO_LOCKED, demoControls } from "./controls";
import { type Table, delay, fail, fakeId, repo, res } from "./repo";

/** Demo commits read like a Conventional Commits history, so the release notes have sections. */
function demoConventional(summary: string): string {
  if (/^Merge /.test(summary) || /^\w+(\([^)]*\))?!?: /.test(summary)) return summary;
  if (/^Fix /.test(summary)) return `fix: ${summary.slice(4)}`;
  if (/^(Bump|Set up|Update|Initial)/.test(summary)) return `chore: ${summary[0].toLowerCase()}${summary.slice(1)}`;
  return `feat: ${summary[0].toLowerCase()}${summary.slice(1)}`;
}

/** Stacked branches in the demo: branch → parent and the parent's tip it was last built on. */
export const demoStacks = new Map<string, { parent: string; base: string }>();

function demoStackList(): StackBranch[] {
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
const demoTransfers: TransferSent[] = [];

const backportCompare: Table["backport_compare"] = ({ source, target }) => {
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
};

export const proCommands = {
  // Patch equivalence is approximated by equal summaries.
  backport_compare: backportCompare,

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
      const items = await backportCompare({ path, source, target });
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
    const commits: NoteCommit[] = [];
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
  transfer_check() {
    const how = demoControls.nextBundle;
    demoControls.nextBundle = null;
    const checksum = how === "mismatch" || how === "absent" ? how : ("match" as const);
    // Like `git bundle verify`: the commits the bundle was cut from, which this repository lacks.
    const missing = how === "missing" ? [fakeId(), fakeId()] : [];
    return delay({
      ok: !missing.length && checksum !== "mismatch",
      checksum,
      heads: ["main", "feature/theme"].map((b) => ({ name: `refs/heads/${b}`, id: repo.branches.get(b)! })),
      missing,
    });
  },
  transfer_import({ name }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    for (const b of ["main", "feature/theme"]) repo.remotes.set(`${name}/${b}`, repo.branches.get(b)!);
    return delay(res("ok"));
  },
} satisfies Partial<Table>;
