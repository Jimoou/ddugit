import type { CommitInfo, HeadInfo, RefInfo } from "../types";

/**
 * Lane layout for a commit DAG.
 *
 * Input commits are newest-first in topological order (what the backend
 * returns). Each commit gets a `row` (0 = newest) and a `lane`. The renderer
 * maps rows onto a left→right timeline (oldest on the left).
 *
 * Lane 0 is reserved for the trunk — the first-parent chain of main/master
 * (or HEAD) — so the main line never wanders.
 */

export interface LayoutNode {
  id: string;
  row: number;
  lane: number;
  color: number;
  isMerge: boolean;
}

export interface LayoutEdge {
  child: string;
  parent: string;
  /** Row/lane of the child (newer) end. */
  childRow: number;
  childLane: number;
  /** Row/lane of the parent (older) end. */
  parentRow: number;
  parentLane: number;
  /** Lane the edge travels in between the two rows. */
  via: number;
  color: number;
  /** Not the first parent, i.e. the edge that brings a branch in. */
  isMergeEdge: boolean;
}

export interface Layout {
  nodes: LayoutNode[];
  byId: Map<string, LayoutNode>;
  edges: LayoutEdge[];
  laneCount: number;
  rowCount: number;
}

export const PALETTE_SIZE = 8;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const baseName = (name: string) => name.replace(/^origin\//, "");

/** Preferred colour per branch name: the same branch keeps its colour across reloads. */
export function colorForBranch(name: string): number {
  const base = baseName(name);
  if (base === "main" || base === "master") return 0;
  return 1 + (hash(base) % (PALETTE_SIZE - 1));
}

/**
 * Colour for every branch name. Starts from the hashed preference and moves
 * to the next free colour on collision, so live branches look distinct while
 * staying stable as long as the branch set doesn't change much.
 */
export function branchColors(refs: RefInfo[]): Map<string, number> {
  const bases = [...new Set(refs.filter((r) => r.kind !== "tag").map((r) => baseName(r.name)))].sort();
  const out = new Map<string, number>();
  const used = new Set<number>();
  for (const b of bases) {
    let c = colorForBranch(b);
    if (c !== 0) {
      for (let i = 0; i < PALETTE_SIZE - 1 && used.has(c); i++) c = (c % (PALETTE_SIZE - 1)) + 1;
      used.add(c);
    }
    out.set(b, c);
  }
  return out;
}

export function trunkName(refs: RefInfo[], head: Pick<HeadInfo, "branch" | "target">): string | null {
  const locals = new Set(refs.filter((r) => r.kind === "local").map((r) => r.name));
  for (const n of ["main", "master", "develop", "trunk"]) if (locals.has(n)) return n;
  return head.branch;
}

export function computeLayout(
  commits: CommitInfo[],
  refs: RefInfo[],
  head: Pick<HeadInfo, "branch" | "target">,
): Layout {
  // Commits are worked on by row: one string-keyed map (`byId`), then plain
  // numbers. 100k commits lay out in tens of milliseconds.
  const n = commits.length;
  const nodes: LayoutNode[] = new Array(n);
  const byId = new Map<string, LayoutNode>();
  for (let row = 0; row < n; row++) {
    const c = commits[row];
    const node: LayoutNode = { id: c.id, row, lane: -1, color: 0, isMerge: c.parents.length > 1 };
    nodes[row] = node;
    byId.set(c.id, node);
  }
  const rowOf = (id: string | null | undefined) => (id ? (byId.get(id)?.row ?? -1) : -1);

  // Branch names pointing at each commit, to colour the lane a tip starts.
  const tipName = new Map<string, string>();
  for (const r of refs) {
    if (r.kind === "tag") continue;
    const cur = tipName.get(r.target);
    // Prefer local branches over remote ones.
    if (!cur || (r.kind === "local" && cur.includes("/"))) tipName.set(r.target, r.name);
  }

  // First-parent chain of the trunk.
  const trunk = new Uint8Array(n);
  const tn = trunkName(refs, head);
  let cursor = rowOf((tn && refs.find((r) => r.kind === "local" && r.name === tn)?.target) || head.target);
  let trunkSize = 0;
  while (cursor >= 0 && !trunk[cursor]) {
    trunk[cursor] = 1;
    trunkSize++;
    cursor = rowOf(commits[cursor].parents[0]);
  }
  const reserve = trunkSize > 0 ? 1 : 0;

  // lanes[i] = row lane i is waiting for (-1 = free).
  const lanes: number[] = [];
  const laneColor: number[] = [];
  let nextColor = 1;
  let laneCount = reserve;

  const alloc = (color: number): number => {
    let i = reserve;
    while (i < lanes.length && lanes[i] !== -1) i++;
    if (i >= lanes.length) lanes.length = i + 1;
    laneColor[i] = color;
    laneCount = Math.max(laneCount, i + 1);
    return i;
  };
  const colors = branchColors(refs);
  const freshColor = (row: number): number => {
    const name = tipName.get(nodes[row].id);
    if (name) return colors.get(baseName(name)) ?? colorForBranch(name);
    const c = nextColor;
    nextColor = (nextColor % (PALETTE_SIZE - 1)) + 1;
    return c;
  };
  if (reserve) {
    lanes[0] = -1;
    laneColor[0] = 0;
  }

  // Edge "via" lanes are known when the child is placed; the parent's lane once it is.
  const edges: LayoutEdge[] = [];
  for (let row = 0; row < n; row++) {
    const c = commits[row];
    let lane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === row) {
        if (lane === -1) lane = i;
        lanes[i] = -1; // converges here
      }
    }
    if (trunk[row]) {
      lane = 0;
    } else if (lane === -1) {
      lane = alloc(freshColor(row));
    }
    const color = laneColor[lane];
    const node = nodes[row];
    node.lane = lane;
    node.color = color;

    let continues = false;
    for (let pi = 0; pi < c.parents.length; pi++) {
      const p = c.parents[pi];
      // Most parents sit on the next row; comparing two ids beats hashing one.
      const pr = commits[row + 1]?.id === p ? row + 1 : rowOf(p);
      if (pr < 0) continue; // parent beyond the loaded window
      let via = lane;
      if (pi === 0) {
        // First parent continues in this commit's lane (and converges into
        // the parent's lane at the parent's row if that differs).
        continues = true;
      } else {
        via = lanes.indexOf(pr);
        if (via === -1) via = alloc(freshColor(pr));
      }
      lanes[via] = pr;
      edges.push({
        child: c.id,
        parent: p,
        childRow: row,
        childLane: lane,
        parentRow: pr,
        parentLane: -1,
        via,
        color: pi === 0 ? color : laneColor[via],
        isMergeEdge: pi > 0,
      });
    }
    if (!continues) lanes[lane] = -1;
  }
  for (const e of edges) e.parentLane = nodes[e.parentRow].lane;

  return { nodes, byId, edges, laneCount: Math.max(laneCount, 1), rowCount: n };
}

/** All ancestors of `id` (inclusive) within the loaded commits. */
export function ancestors(commits: CommitInfo[], id: string): Set<string> {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const out = new Set<string>();
  const stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    const c = byId.get(cur);
    if (!c) continue;
    out.add(cur);
    for (const p of c.parents) stack.push(p);
  }
  return out;
}

const ancestorSets = new WeakMap<CommitInfo[], Map<string, Set<string>>>();
/** `ancestors`, remembered per commit list (a new snapshot is a new list). */
export function ancestorsOf(commits: CommitInfo[], id: string): Set<string> {
  let byTip = ancestorSets.get(commits);
  if (!byTip) ancestorSets.set(commits, (byTip = new Map()));
  let set = byTip.get(id);
  if (!set) byTip.set(id, (set = ancestors(commits, id)));
  return set;
}

const descendantSets = new WeakMap<CommitInfo[], Map<string, Set<string>>>();
/**
 * All descendants of `id` (inclusive) within the loaded commits, remembered
 * per commit list. One pass over the newer rows (children come before
 * parents), where asking every branch tip for its ancestors would walk the
 * history once per branch.
 */
export function descendantsOf(commits: CommitInfo[], id: string): Set<string> {
  let byId = descendantSets.get(commits);
  if (!byId) descendantSets.set(commits, (byId = new Map()));
  let set = byId.get(id);
  if (set) return set;
  set = new Set<string>();
  const at = commits.findIndex((c) => c.id === id);
  if (at >= 0) set.add(id);
  for (let i = at - 1; i >= 0; i--) if (commits[i].parents.some((p) => set.has(p))) set.add(commits[i].id);
  byId.set(id, set);
  return set;
}
