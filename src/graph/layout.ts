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

export function trunkName(refs: RefInfo[], head: HeadInfo): string | null {
  const locals = new Set(refs.filter((r) => r.kind === "local").map((r) => r.name));
  for (const n of ["main", "master", "develop", "trunk"]) if (locals.has(n)) return n;
  return head.branch;
}

export function computeLayout(commits: CommitInfo[], refs: RefInfo[], head: HeadInfo): Layout {
  const index = new Map<string, number>();
  commits.forEach((c, i) => index.set(c.id, i));

  // Branch names pointing at each commit, to colour the lane a tip starts.
  const tipName = new Map<string, string>();
  for (const r of refs) {
    if (r.kind === "tag") continue;
    const cur = tipName.get(r.target);
    // Prefer local branches over remote ones.
    if (!cur || (r.kind === "local" && cur.includes("/"))) tipName.set(r.target, r.name);
  }

  // First-parent chain of the trunk.
  const trunk = new Set<string>();
  const tn = trunkName(refs, head);
  let cursor = (tn && refs.find((r) => r.kind === "local" && r.name === tn)?.target) || head.target || null;
  while (cursor && index.has(cursor) && !trunk.has(cursor)) {
    trunk.add(cursor);
    cursor = commits[index.get(cursor)!].parents[0] ?? null;
  }
  const reserve = trunk.size > 0 ? 1 : 0;

  // lanes[i] = commit id lane i is waiting for (null = free).
  const lanes: (string | null)[] = [];
  const laneColor: number[] = [];
  let nextColor = 1;
  let laneCount = reserve;

  const alloc = (color: number): number => {
    let i = reserve;
    while (i < lanes.length && lanes[i] !== null) i++;
    if (i >= lanes.length) lanes.length = i + 1;
    laneColor[i] = color;
    laneCount = Math.max(laneCount, i + 1);
    return i;
  };
  const colors = branchColors(refs);
  const freshColor = (id: string): number => {
    const name = tipName.get(id);
    if (name) return colors.get(baseName(name)) ?? colorForBranch(name);
    const c = nextColor;
    nextColor = (nextColor % (PALETTE_SIZE - 1)) + 1;
    return c;
  };
  if (reserve) {
    lanes[0] = null;
    laneColor[0] = 0;
  }

  const nodes: LayoutNode[] = [];
  const byId = new Map<string, LayoutNode>();
  // Edge "via" lanes are known when the child is placed; the parent end is filled in later.
  const pending: { child: string; parent: string; via: number; color: number; merge: boolean }[] = [];

  commits.forEach((c, row) => {
    let lane = -1;
    for (let i = 0; i < lanes.length; i++) {
      if (lanes[i] === c.id) {
        if (lane === -1) lane = i;
        lanes[i] = null; // converges here
      }
    }
    if (trunk.has(c.id)) {
      lane = 0;
    } else if (lane === -1) {
      lane = alloc(freshColor(c.id));
    }
    const color = laneColor[lane];

    const node: LayoutNode = { id: c.id, row, lane, color, isMerge: c.parents.length > 1 };
    nodes.push(node);
    byId.set(c.id, node);

    let continues = false;
    c.parents.forEach((p, pi) => {
      if (!index.has(p)) return; // parent beyond the loaded window
      if (pi === 0) {
        // First parent continues in this commit's lane (and converges into
        // the parent's lane at the parent's row if that differs).
        lanes[lane] = p;
        continues = true;
        pending.push({ child: c.id, parent: p, via: lane, color, merge: false });
        return;
      }
      let via = lanes.indexOf(p);
      if (via === -1) via = alloc(freshColor(p));
      lanes[via] = p;
      pending.push({ child: c.id, parent: p, via, color: laneColor[via], merge: true });
    });
    if (!continues) lanes[lane] = null;
  });

  const edges: LayoutEdge[] = [];
  for (const e of pending) {
    const ch = byId.get(e.child)!;
    const pa = byId.get(e.parent);
    if (!pa) continue;
    edges.push({
      child: e.child,
      parent: e.parent,
      childRow: ch.row,
      childLane: ch.lane,
      parentRow: pa.row,
      parentLane: pa.lane,
      via: e.via,
      color: e.color,
      isMergeEdge: e.merge,
    });
  }

  return { nodes, byId, edges, laneCount: Math.max(laneCount, 1), rowCount: commits.length };
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
