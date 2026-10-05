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
  // Counted by row: string-keyed maps cost more than the rest on 100k commits.
  const nodes = layout.nodes;
  const parents = new Uint32Array(nodes.length);
  const children = new Uint32Array(nodes.length);
  const parentRow = new Int32Array(nodes.length).fill(-1);
  for (const e of layout.edges) {
    parents[e.childRow]++;
    children[e.parentRow]++;
    parentRow[e.childRow] = e.parentRow;
  }
  const plain = (row: number) => parents[row] === 1 && children[row] === 1 && !keep(nodes[row].id);

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
    const linked = next && next.lane === nodes[row].lane && parentRow[row] === row + 1 && plain(row + 1);
    if (!linked) close(row);
  }
  return runs;
}

/** Runs that reach into rows `first..last`; `runs` come ordered by row and never overlap. */
export function runsInRows(runs: Run[], first: number, last: number): Run[] {
  let lo = 0,
    hi = runs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (runs[mid].last < first) lo = mid + 1;
    else hi = mid;
  }
  const out: Run[] = [];
  for (let i = lo; i < runs.length && runs[i].first <= last; i++) out.push(runs[i]);
  return out;
}

/** Run membership by commit id. */
export function runIndex(runs: Run[]): Map<string, Run> {
  const m = new Map<string, Run>();
  for (const r of runs) for (const id of r.ids) m.set(id, r);
  return m;
}
