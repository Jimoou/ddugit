// Demo commands that move or rewrite history: merge, pick, rebase, edit, bisect, reset, reflog, file history and blame.

import type { Blame, CommitInfo, TodoItem } from "../types";
import { applyPlan } from "../rebasePlan";
import { demoControls } from "./controls";
import { type Table, delay, fail, fakeFile, filesOf, hash, repo, res } from "./repo";

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

/** A git pathspec as the demo understands it: the file, a folder above it, or a glob. */
function pathMatches(spec: string, file: string) {
  const s = spec.replace(/\/+$/, "");
  if (file === s || file.startsWith(`${s}/`)) return true;
  const glob = s
    .replace(/[.+^${}()|\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return /[*?]/.test(s) && new RegExp(`^${glob}$`).test(file);
}

const searchCommits: Table["search_commits"] = ({ query, kind, regex, limit }) => {
  const q = query.trim();
  let test: (text: string) => boolean;
  try {
    const re = regex ? new RegExp(q, "i") : null;
    test = (text) => (re ? re.test(text) : text.toLowerCase().includes(q.toLowerCase()));
  } catch (e) {
    return fail(`fatal: invalid regular expression: ${String(e)}`);
  }
  // The changed lines of the demo's made-up diff for a commit (what `-S` / `-G` look through).
  const changed = (c: CommitInfo) =>
    filesOf(c.id)
      .flatMap((f) => fakeFile(f, hash(c.id), c.summary).hunks.flatMap((h) => h.lines))
      .filter((l) => l.kind !== " ")
      .map((l) => l.text);
  const matches = (c: CommitInfo) =>
    kind === "message"
      ? test(c.message)
      : kind === "author"
        ? test(`${c.author} <${c.email}>`)
        : kind === "path"
          ? filesOf(c.id).some((f) => pathMatches(q, f))
          : changed(c).some(test);
  const found = q ? repo.snapshot().commits.filter(matches) : [];
  const hits = found.slice(0, limit).map(({ id, summary, author, time }) => ({ id, summary, author, time }));
  return delay({ hits, more: found.length > limit, timedOut: false });
};

/** Marks a binary file among the demo's conflicted files (`conflict_file` shows no text for it). */
export const DEMO_BINARY = "\0binary";

/**
 * Stop `state` (merge, cherry-pick, revert, rebase; "clean" for a stash pop) on a conflict in two files,
 * like `conflictNext` asks. A stopped pick or revert keeps the commit it will make (`summary`), a stopped
 * rebase the tip it will leave (`tip`), for "continue".
 */
export function stopOnConflict(
  state: string,
  source: string,
  label: string,
  done: { summary?: string; tip?: string } = {},
) {
  demoControls.conflictNext = false;
  const files = new Map([
    ["src/App.css", DEMO_CONFLICT_CSS.replaceAll("{theirs}", label)],
    ["src/graph/scene.ts", DEMO_CONFLICT_TS.replaceAll("{theirs}", label)],
  ]);
  if (demoControls.binaryConflict) files.set("assets/logo.png", DEMO_BINARY);
  demoControls.binaryConflict = false;
  repo.pending = { source, label, files, ...done };
  repo.state = state;
  for (const path of files.keys()) repo.changes.push({ path, staged: null, unstaged: "modified", conflicted: true });
  return delay(res("conflict", "CONFLICT (content): Merge conflict in src/App.css"));
}

export const historyCommands = {
  git_merge({ source, target, mode, message }) {
    const t = target ?? repo.head;
    if (!repo.branches.has(t)) return fail(`Unknown branch '${t}'`);
    repo.head = t;
    const src = repo.resolve(source);
    if (!src) return fail(`merge: ${source} - not something we can merge`);
    const tip = repo.branches.get(t)!;
    if (repo.ancestors(tip).has(src)) return delay(res("ok", "Already up to date."));
    if (mode === "squash") {
      // Like `--squash`: the changes staged (or stopped on conflicts, shown as a squash in progress).
      if (repo.changes.some((c) => c.staged || (c.unstaged && c.unstaged !== "untracked")))
        return fail("Commit or stash your changes before a squash merge");
      if (demoControls.conflictNext) return stopOnConflict("squash", src, source);
      const mine = repo.ancestors(tip);
      const paths = new Set([...repo.ancestors(src)].filter((id) => !mine.has(id)).flatMap((id) => filesOf(id)));
      for (const path of paths) {
        repo.changes = repo.changes.filter((c) => c.path !== path);
        repo.changes.push({ path, staged: "modified", unstaged: null, conflicted: false });
      }
      return delay(res("ok", "Squash commit -- not updating HEAD"));
    }
    if (mode === "fastForward" && repo.ancestors(src).has(tip)) {
      repo.branches.set(t, src);
      return delay(res("ok", "Fast-forward"));
    }
    if (demoControls.conflictNext) return stopOnConflict("merge", src, source);
    const named = repo.branches.has(source) || repo.remotes.has(source);
    repo.merge(
      source,
      t,
      message ?? `Merge ${named ? `branch '${source}'` : `commit ${source.slice(0, 7)}`} into ${t}`,
    );
    return delay(res("ok", "Merge made by the 'ort' strategy."));
  },

  git_rebase_onto({ upstream }) {
    if (repo.state !== "clean") return fail("Repository is in the middle of an operation");
    const onto = repo.resolve(upstream);
    if (!onto) return fail(`invalid upstream '${upstream}'`);
    const theirs = repo.ancestors(onto);
    // The branch's own commits, oldest first; merges among them are flattened, as plain `git rebase` does.
    const ours = repo.ancestors(repo.branches.get(repo.head)!);
    const mine = repo.order.filter((id) => ours.has(id) && !theirs.has(id) && repo.commits.get(id)!.parents.length < 2);
    let tip = onto;
    for (const id of mine.reverse())
      tip = repo.commit([tip], repo.commits.get(id)!.summary, repo.commits.get(id)!.author);
    if (demoControls.conflictNext && mine.length)
      return stopOnConflict("rebase", mine[0], mine[0].slice(0, 7), { tip });
    repo.branches.set(repo.head, tip);
    return delay(res("ok", `Successfully rebased and updated refs/heads/${repo.head}.`));
  },

  git_abort() {
    if (repo.bisect) {
      repo.bisect = null;
      return delay(res("ok", "Bisect reset"));
    }
    if (repo.pending) repo.changes = repo.changes.filter((c) => !repo.pending!.files.has(c.path));
    repo.pending = null;
    repo.skipRest = [];
    repo.state = "clean";
    return delay(res("ok"));
  },

  git_pick({ op, ids, target, mainline }) {
    const missing = ids.find((id) => !repo.commits.has(id));
    if (!ids.length || missing) return fail(`Unknown commit ${missing ?? ""}`);
    const merges = ids.map((id) => repo.commits.get(id)!.parents.length).filter((n) => n > 1);
    if (mainline !== null && (!merges.length || mainline < 1 || mainline > Math.min(...merges)))
      return fail(`A merge here has ${Math.min(...merges, 1)} parents, not ${mainline}`);
    const t = target ?? repo.head;
    if (!repo.branches.has(t)) return fail(`Unknown branch '${t}'`);
    repo.head = t;
    demoControls.lastPick = { op, ids, mainline };
    const summaries = ids.map((id) => {
      const s = repo.commits.get(id)!.summary;
      return op === "revert" ? `Revert "${s}"` : s;
    });
    if (demoControls.conflictNext) {
      // Stops on the first; "continue" (or "skip") goes on with the rest.
      repo.skipRest = summaries.slice(1);
      return stopOnConflict(op === "revert" ? "revert" : "cherry-pick", ids[0], ids[0].slice(0, 7), {
        summary: summaries[0],
      });
    }
    for (const s of summaries) repo.add(t, s);
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
    // Like `write::continue_op`: a merge is concluded by committing, not continued.
    if (repo.state === "clean" || repo.state === "merge") return fail(`Nothing to continue (${repo.state})`);
    // The real one stages tracked files first (`add -u`), so what is left in conflict goes in as it is.
    const p = repo.pending;
    if (p?.summary) repo.add(repo.head, p.summary);
    for (const summary of repo.skipRest) repo.add(repo.head, summary);
    repo.skipRest = [];
    if (p?.tip) repo.branches.set(repo.head, p.tip);
    if (p) repo.changes = repo.changes.filter((c) => !p.files.has(c.path));
    repo.pending = null;
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
    // Stopped part-way: "continue" leaves the branch where the whole plan would have.
    if (demoControls.conflictNext) return stopOnConflict("rebase", steps[0].id, steps[0].id.slice(0, 7), { tip });
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
  search_commits: searchCommits,
  async save_file({ path, rev, file, dest }) {
    if (!(await fileLog({ path, rev, file })).length) return fail(`'${file}' is not in ${rev.slice(0, 7)}`);
    if (dest.split(/[\\/]/).includes(".git")) return fail(`Can't save into a .git folder: ${dest}`);
    demoControls.saved.push({ rev, file, dest });
    return delay(res("ok", dest));
  },
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
