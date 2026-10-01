import type { Layout } from "./layout";

/**
 * A straight stretch of plain commits in one lane. Zoomed out, the renderer
 * draws it as one bar with a count instead of a row of identical dots.
 */
export interface Run {
  lane: number;
  color: number;
  /** Newest row of the run (rows count up into the past). */
  first: number;
  /** Oldest row of the run. */
  last: number;
  ids: string[];
}

/**
 * Maximal runs of at least `min` consecutive rows whose commits each have one
 * parent and one child, the parent being the next row in the same lane, and
 * that `keep` does not mark (refs, HEAD, stash bases, …).
 */
export function straightRuns(layout: Layout, keep: (id: string) => boolean, min = 4): Run[] {
  const parentOf = new Map<string, string>();
  const parents = new Map<string, number>();
  const children = new Map<string, number>();
  for (const e of layout.edges) {
    parents.set(e.child, (parents.get(e.child) ?? 0) + 1);
    children.set(e.parent, (children.get(e.parent) ?? 0) + 1);
    parentOf.set(e.child, e.parent);
  }
  const nodes = layout.nodes;
  const plain = (row: number) => {
    const id = nodes[row].id;
    return parents.get(id) === 1 && children.get(id) === 1 && !keep(id);
  };

  const runs: Run[] = [];
  let start = -1;
  const close = (end: number) => {
    if (start >= 0 && end - start + 1 >= min) {
      const ids = nodes.slice(start, end + 1).map((n) => n.id);
      runs.push({ lane: nodes[start].lane, color: nodes[start].color, first: start, last: end, ids });
    }
    start = -1;
  };
  for (let row = 0; row < nodes.length; row++) {
    if (!plain(row)) {
      close(row - 1);
      continue;
    }
    if (start < 0) start = row;
    const next = nodes[row + 1];
    const linked = next && next.lane === nodes[row].lane && parentOf.get(nodes[row].id) === next.id && plain(row + 1);
    if (!linked) close(row);
  }
  return runs;
}

/** Run membership by commit id. */
export function runIndex(runs: Run[]): Map<string, Run> {
  const m = new Map<string, Run>();
  for (const r of runs) for (const id of r.ids) m.set(id, r);
  return m;
}
