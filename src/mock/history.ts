// Demo commands that move or rewrite history: merge, pick, rebase, edit, bisect, reset, reflog, file history and blame.

import type { Blame, CommitInfo, TodoItem } from "../types";
import { applyPlan } from "../rebasePlan";
import { demoControls } from "./controls";
import { type Table, delay, fail, filesOf, hash, repo, res } from "./repo";

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

const fileLog: Table["file_log"] = ({ rev, file }) => {
  const tip = (rev === "HEAD" ? repo.branches.get(repo.head) : repo.branches.get(rev)) ?? rev;
  if (!repo.commits.has(tip)) return fail(`Unknown revision ${rev}`);
  const seen = repo.ancestors(tip);
  return delay(repo.order.filter((id) => seen.has(id) && filesOf(id).includes(file)).map((id) => ({ id, path: file })));
};

export const historyCommands = {
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

  git_continue() {
    repo.state = "clean";
    return delay(res("ok"));
  },

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
  file_log: fileLog,
  async git_blame({ path, rev, file }) {
    const touches = await fileLog({ path, rev, file });
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
} satisfies Partial<Table>;
