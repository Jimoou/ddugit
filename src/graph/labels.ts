// Collision-free placement of ref badges above graph nodes. Pure (screen
// coordinates in, rectangles out) so it can be unit-tested.

interface BadgeGroup {
  /** Node centre x. */
  x: number;
  /** Bottom edge of the first badge when not lifted. */
  baseY: number;
  /** Badge widths, bottom to top. */
  widths: number[];
  /** Placed first, so e.g. HEAD's labels never move. */
  priority?: boolean;
}

interface PlacedBadge {
  /** Index into the group's `widths`; -1 for the "+N" overflow chip. */
  index: number;
  x: number;
  y: number;
  w: number;
}

export interface PlacedGroup {
  badges: PlacedBadge[];
  /** Levels the stack was raised to dodge neighbours (draw a leader line when > 0). */
  lift: number;
  /** Badges folded into the "+N" chip. */
  hidden: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 3;
const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w + PAD && b.x < a.x + a.w + PAD && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;

/**
 * Place every group's stack at the lowest lift (0..maxLift) where it hits no
 * earlier stack. If none fits, keep just the first badge plus a "+N" chip; if
 * even that collides everywhere, it goes at lift 0 anyway (better overlapping
 * than missing).
 */
export function placeBadges(
  groups: BadgeGroup[],
  { height = 18, gap = 4, maxLift = 3, chipWidth = 30 } = {},
): PlacedGroup[] {
  const step = height + gap;
  const taken: Box[] = [];
  const out: PlacedGroup[] = groups.map(() => ({ badges: [], lift: 0, hidden: 0 }));
  const order = groups.map((_, i) => i).sort((a, b) => Number(!!groups[b].priority) - Number(!!groups[a].priority));

  const stack = (g: BadgeGroup, widths: number[], lift: number): PlacedBadge[] =>
    widths.map((w, level) => ({
      index: level,
      x: g.x - w / 2,
      y: g.baseY - height - (lift + level) * step,
      w,
    }));
  const free = (bs: PlacedBadge[]) => bs.every((b) => !taken.some((t) => overlaps({ ...b, h: height }, t)));

  for (const i of order) {
    const g = groups[i];
    if (!g.widths.length) continue;
    let placed: PlacedGroup | null = null;
    for (let lift = 0; lift <= maxLift && !placed; lift++) {
      const bs = stack(g, g.widths, lift);
      if (free(bs)) placed = { badges: bs, lift, hidden: 0 };
    }
    if (!placed && g.widths.length > 1) {
      const hidden = g.widths.length - 1;
      for (let lift = 0; lift <= maxLift && !placed; lift++) {
        const bs = stack(g, [g.widths[0], chipWidth], lift);
        bs[1].index = -1;
        if (free(bs)) placed = { badges: bs, lift, hidden };
      }
    }
    if (!placed) {
      const bs = stack(g, g.widths.length > 1 ? [g.widths[0], chipWidth] : [g.widths[0]], 0);
      if (bs[1]) bs[1].index = -1;
      placed = { badges: bs, lift: 0, hidden: g.widths.length - 1 };
    }
    out[i] = placed;
    for (const b of placed.badges) taken.push({ ...b, h: height });
  }
  return out;
}

/**
 * Badges in a line on a commit's own row (graph turned upright), from `start`
 * running away from the graph (`side` 1: rightwards, -1: leftwards), centred
 * on `y`. `end` is where the summary can begin.
 */
export function inlineBadges(
  start: number,
  side: 1 | -1,
  y: number,
  widths: number[],
  height = 18,
  gap = 4,
): PlacedGroup & { end: number } {
  let at = start;
  const badges = widths.map((w, index) => {
    const x = side > 0 ? at : at - w;
    at += side * (w + gap);
    return { index, x, y: y - height / 2, w };
  });
  return { badges, lift: 0, hidden: 0, end: widths.length ? at + side * 2 : start };
}
