import type { Layout } from "./layout";

/** Arrow keys on the graph. Time runs left → right, lanes top → bottom. */
export type Step = "older" | "newer" | "up" | "down";

/**
 * The commit an arrow key moves to from `id`:
 * - older / newer follow the first parent / a child (preferring one in the
 *   same lane, i.e. the same branch line);
 * - up / down go to the nearest commit (by row) in the closest lane above /
 *   below that has any.
 * Returns null when there is nowhere to go.
 */
export function stepFrom(layout: Layout, id: string, step: Step): string | null {
  const node = layout.byId.get(id);
  if (!node) return null;
  if (step === "older") {
    const e = layout.edges.find((x) => x.child === id && !x.isMergeEdge);
    return e?.parent ?? null;
  }
  if (step === "newer") {
    const kids = layout.edges.filter((x) => x.parent === id);
    const same = kids.find((x) => x.childLane === node.lane) ?? kids.sort((a, b) => b.childRow - a.childRow)[0];
    return same?.child ?? null;
  }
  const dir = step === "up" ? -1 : 1;
  for (let lane = node.lane + dir; lane >= 0 && lane < layout.laneCount; lane += dir) {
    let best: string | null = null;
    let dist = Infinity;
    for (const n of layout.nodes) {
      if (n.lane !== lane) continue;
      const d = Math.abs(n.row - node.row);
      if (d < dist) [best, dist] = [n.id, d];
    }
    if (best) return best;
  }
  return null;
}
