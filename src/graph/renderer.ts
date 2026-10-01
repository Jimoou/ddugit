import { stashTitle } from "../format";
import type { RefInfo, StashInfo } from "../types";
import { COL, LANE, NEON, pointAt, type Pt, type Scene, xOf, yOf } from "./scene";

export interface View {
  k: number;
  tx: number;
  ty: number;
}

export interface Drag {
  from: string;
  /** Cursor in screen space. */
  to: Pt;
  target: string | null;
  valid: boolean;
}

export interface DrawState {
  scene: Scene;
  view: View;
  w: number;
  h: number;
  dpr: number;
  time: number;
  animate: boolean;
  headId: string | null;
  headBranch: string | null;
  plus: Pt;
  plusHover: boolean;
  changeCount: number;
  selected: string | null;
  hovered: string | null;
  focus: Set<string> | null;
  refs: Map<string, RefInfo[]>;
  summaries: Map<string, string>;
  drag: Drag | null;
  births: Map<string, number>;
  stashes: StashMark[];
  stashHover: number | null;
  stashSelected: number | null;
}

/** A stash drawn as a small diamond hanging off the commit it was taken on. */
export interface StashMark {
  index: number;
  message: string;
  base: Pt;
  pos: Pt;
}

export function stashMarks(scene: Scene, stashes: StashInfo[]): StashMark[] {
  const perBase = new Map<string, number>();
  const n = scene.layout.rowCount;
  return stashes.flatMap((st) => {
    const node = scene.layout.byId.get(st.base);
    if (!node) return []; // base outside the loaded history
    const i = perBase.get(st.base) ?? 0;
    perBase.set(st.base, i + 1);
    const base = { x: xOf(node.row, n), y: yOf(node.lane) };
    return [
      {
        index: st.index,
        message: stashTitle(st.message),
        base,
        pos: { x: base.x + COL * (0.5 + i * 0.3), y: base.y + LANE * 0.45 },
      },
    ];
  });
}

export const stashRadius = (k: number) => Math.max(4, Math.min(8, 6 * k));

/** Zoom thresholds for semantic zoom. */
export const ZOOM = { dots: 0.35, branches: 0.55, allRefs: 0.8, summaries: 1.25 };

const BG_TOP = "#0b0916";
const BG_BOTTOM = "#05040a";
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const SANS = '-apple-system, BlinkMacSystemFont, "Segoe UI", "Pretendard", "Noto Sans KR", sans-serif';

export const toScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.k + v.tx, y: p.y * v.k + v.ty });
export const toWorld = (v: View, p: Pt): Pt => ({ x: (p.x - v.tx) / v.k, y: (p.y - v.ty) / v.k });

export function plusPosition(scene: Scene, headId: string | null): Pt {
  const node = headId ? scene.layout.byId.get(headId) : undefined;
  if (!node) return { x: 0, y: 0 };
  const n = scene.layout.rowCount;
  const free = !scene.grid.has(`${node.row - 1}:${node.lane}`);
  return {
    x: xOf(node.row, n) + COL,
    y: free ? yOf(node.lane) : yOf(scene.layout.laneCount),
  };
}

export function nodeRadius(k: number): number {
  return Math.max(2.5, Math.min(8, 6.5 * k));
}

function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function truncate(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let lo = 0,
    hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + "…").width <= max) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + "…";
}

export function draw(ctx: CanvasRenderingContext2D, s: DrawState) {
  const { scene, view, w, h, dpr, time } = s;
  const { k } = view;
  const n = scene.layout.rowCount;

  // --- background -----------------------------------------------------------
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, BG_TOP);
  bg.addColorStop(1, BG_BOTTOM);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Dot grid that scales with zoom (fades out when too dense).
  const step = COL * k;
  if (step > 14) {
    ctx.fillStyle = `rgba(140,120,255,${Math.min(0.12, (step - 14) / 300)})`;
    const ox = ((view.tx % step) + step) % step;
    const oy = (((view.ty - (LANE * k) / 2) % (LANE * k)) + LANE * k) % (LANE * k);
    for (let x = ox; x < w; x += step) for (let y = oy; y < h; y += LANE * k) ctx.fillRect(x, y, 1, 1);
  }

  // Visible world rect (with margin).
  const m = 40 / k;
  const vx0 = -view.tx / k - m,
    vx1 = (w - view.tx) / k + m;
  const vy0 = -view.ty / k - m,
    vy1 = (h - view.ty) / k + m;

  const dim = (id: string) => s.focus !== null && !s.focus.has(id);

  // --- edges ----------------------------------------------------------------
  ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * view.tx, dpr * view.ty);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const visible = scene.edges.filter((e) => e.maxX >= vx0 && e.minX <= vx1 && e.maxY >= vy0 && e.minY <= vy1);

  ctx.globalCompositeOperation = "lighter";
  for (const e of visible) {
    const c = NEON[e.edge.color];
    const d = dim(e.edge.child) || dim(e.edge.parent);
    ctx.strokeStyle = alpha(c, d ? 0.03 : 0.16);
    ctx.lineWidth = 9 / k;
    ctx.stroke(e.path);
    ctx.strokeStyle = alpha(c, d ? 0.05 : 0.28);
    ctx.lineWidth = 4.5 / k;
    ctx.stroke(e.path);
  }
  ctx.globalCompositeOperation = "source-over";
  for (const e of visible) {
    const c = NEON[e.edge.color];
    const d = dim(e.edge.child) || dim(e.edge.parent);
    ctx.strokeStyle = d ? alpha(c, 0.2) : c;
    ctx.lineWidth = (e.edge.isMergeEdge ? 1.6 : 2.2) / Math.max(k, 0.5);
    ctx.stroke(e.path);
  }

  // --- sparkles flowing along edges (parent → child, i.e. forward in time) --
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (s.animate && k > 0.2) {
    ctx.globalCompositeOperation = "lighter";
    const speed = 70; // world px / s
    for (const e of visible) {
      if (dim(e.edge.child)) continue;
      const count = Math.max(1, Math.round(e.length / (COL * 2.2)));
      const c = NEON[e.edge.color];
      for (let i = 0; i < count; i++) {
        const t = ((((time * speed) / e.length + i / count + e.seed) % 1) + 1) % 1;
        const p = toScreen(view, pointAt(e, t));
        if (p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) continue;
        const fade = Math.sin(t * Math.PI); // fade in/out at the ends
        const r = Math.max(2, 4.5 * Math.min(k, 1.4));
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
        g.addColorStop(0, alpha("#ffffff", 0.9 * fade));
        g.addColorStop(0.25, alpha(c, 0.7 * fade));
        g.addColorStop(1, alpha(c, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalCompositeOperation = "source-over";
  }

  // --- link HEAD → [+] --------------------------------------------------------
  const plusS = toScreen(view, s.plus);
  const headNode = s.headId ? scene.layout.byId.get(s.headId) : undefined;
  if (headNode) {
    const hs = toScreen(view, { x: xOf(headNode.row, n), y: yOf(headNode.lane) });
    const c = NEON[headNode.color];
    ctx.save();
    ctx.setLineDash([4, 6]);
    ctx.lineDashOffset = s.animate ? -time * 24 : 0;
    ctx.strokeStyle = alpha(c, s.changeCount ? 0.85 : 0.4);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(hs.x, hs.y);
    const mx = (hs.x + plusS.x) / 2;
    ctx.bezierCurveTo(mx, hs.y, mx, plusS.y, plusS.x, plusS.y);
    ctx.stroke();
    ctx.restore();
  }

  // --- nodes ------------------------------------------------------------------
  const r = nodeRadius(k);
  const firstCol = Math.max(0, Math.floor(n - 1 - vx1 / COL));
  const lastCol = Math.min(n - 1, Math.ceil(n - 1 - vx0 / COL));
  const nodes = scene.layout.nodes;
  const labelQueue: { x: number; y: number; id: string; color: string; d: boolean }[] = [];

  for (let row = firstCol; row <= lastCol; row++) {
    const node = nodes[row];
    if (!node) continue;
    const p = toScreen(view, { x: xOf(node.row, n), y: yOf(node.lane) });
    if (p.y < -30 || p.y > h + 30) continue;
    const c = NEON[node.color];
    const d = dim(node.id);
    const born = s.births.get(node.id);
    let scale = 1;
    if (born !== undefined) {
      const t = (time - born) / 0.9;
      if (t < 1) {
        scale = 1 + 0.6 * Math.sin(Math.min(1, t * 1.6) * Math.PI) * (1 - t);
        // Expanding ring burst.
        ctx.strokeStyle = alpha(c, 0.8 * (1 - t));
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + 28 * t, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const rr = r * scale;

    if (!d && k > ZOOM.dots) {
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 3.2);
      g.addColorStop(0, alpha(c, 0.45));
      g.addColorStop(1, alpha(c, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr * 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
    if (node.isMerge) {
      ctx.fillStyle = d ? alpha(c, 0.25) : c;
      ctx.fill();
    } else {
      ctx.fillStyle = "#0a0814";
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, 2.2 * Math.min(k, 1));
      ctx.strokeStyle = d ? alpha(c, 0.25) : c;
      ctx.stroke();
    }

    if (node.id === s.headId) {
      const pulse = s.animate ? (Math.sin(time * 3) + 1) / 2 : 0.5;
      ctx.strokeStyle = alpha("#ffffff", 0.5 + 0.4 * pulse);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr + 4 + pulse * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (node.id === s.selected || node.id === s.hovered || node.id === s.drag?.target) {
      ctx.strokeStyle = node.id === s.drag?.target ? "#ffffff" : alpha("#ffffff", node.id === s.selected ? 0.95 : 0.5);
      ctx.lineWidth = node.id === s.drag?.target ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, rr + (node.id === s.drag?.target ? 9 : 7), 0, Math.PI * 2);
      ctx.stroke();
    }
    labelQueue.push({ x: p.x, y: p.y, id: node.id, color: c, d });
  }

  // --- stashes ----------------------------------------------------------------
  for (const m of s.stashes) {
    const b = toScreen(view, m.base);
    const p = toScreen(view, m.pos);
    if (p.x < -40 || p.x > w + 40 || p.y < -40 || p.y > h + 40) continue;
    const c = NEON[3];
    const on = m.index === s.stashHover || m.index === s.stashSelected;
    const sr = stashRadius(k) * (on ? 1.2 : 1);
    ctx.save();
    ctx.setLineDash([2, 4]);
    ctx.strokeStyle = alpha(c, 0.6);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.quadraticCurveTo(p.x, b.y, p.x, p.y);
    ctx.stroke();
    ctx.restore();
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, sr * 3);
    g.addColorStop(0, alpha(c, on ? 0.6 : 0.35));
    g.addColorStop(1, alpha(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(p.x - sr * 3, p.y - sr * 3, sr * 6, sr * 6);
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - sr);
    ctx.lineTo(p.x + sr, p.y);
    ctx.lineTo(p.x, p.y + sr);
    ctx.lineTo(p.x - sr, p.y);
    ctx.closePath();
    ctx.fillStyle = on ? c : "#0a0814";
    ctx.fill();
    ctx.strokeStyle = c;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    if (on || k >= ZOOM.summaries) {
      ctx.font = `600 11px ${SANS}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = c;
      ctx.fillText(truncate(ctx, `stash · ${m.message}`, 220), p.x + sr + 6, p.y);
    }
  }

  // --- labels (semantic zoom) -------------------------------------------------
  if (k >= ZOOM.branches) {
    for (const L of labelQueue) {
      const refs = s.refs.get(L.id);
      let y = L.y - r - 10;
      if (refs) {
        const shown = refs.filter((rf) => k >= ZOOM.allRefs || rf.kind === "local" || rf.name === s.headBranch);
        ctx.font = `600 11px ${SANS}`;
        for (const rf of shown) {
          const isHead = rf.kind === "local" && rf.name === s.headBranch && L.id === s.headId;
          const label = (isHead ? "◉ " : rf.kind === "remote" ? "☁ " : rf.kind === "tag" ? "◆ " : "") + rf.name;
          const tw = Math.min(ctx.measureText(label).width, 160);
          const bw = tw + 14,
            bh = 18;
          const bx = L.x - bw / 2,
            by = y - bh;
          const col = rf.kind === "tag" ? NEON[3] : L.color;
          ctx.globalAlpha = L.d ? 0.3 : rf.kind === "remote" ? 0.75 : 1;
          roundRect(ctx, bx, by, bw, bh, 9);
          ctx.fillStyle = isHead ? col : "rgba(10,8,20,0.85)";
          ctx.fill();
          ctx.strokeStyle = col;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = isHead ? "#07060d" : col;
          ctx.textBaseline = "middle";
          ctx.textAlign = "center";
          ctx.fillText(truncate(ctx, label, 160), L.x, by + bh / 2 + 0.5);
          ctx.globalAlpha = 1;
          y -= bh + 4;
        }
      }
      if (k >= ZOOM.summaries || L.id === s.selected || L.id === s.hovered) {
        const text = s.summaries.get(L.id) ?? "";
        ctx.font = `12px ${SANS}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        const max = L.id === s.hovered || L.id === s.selected ? 260 : COL * k - 10;
        ctx.fillStyle = L.d ? "rgba(220,215,255,0.25)" : "rgba(230,225,255,0.85)";
        ctx.fillText(truncate(ctx, text, max), L.x, L.y + r + 9);
      }
    }
  }

  // --- drag-to-merge cable ----------------------------------------------------
  if (s.drag) {
    const src = scene.layout.byId.get(s.drag.from);
    if (src) {
      const a = toScreen(view, { x: xOf(src.row, n), y: yOf(src.lane) });
      const b = s.drag.to;
      const c = s.drag.valid ? "#ffffff" : NEON[src.color];
      const mx = (a.x + b.x) / 2;
      ctx.globalCompositeOperation = "lighter";
      for (const [lw, al] of [
        [10, 0.12],
        [5, 0.3],
        [2, 1],
      ] as const) {
        ctx.strokeStyle = alpha(s.drag.valid ? NEON[6] : NEON[src.color], al);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.bezierCurveTo(mx, a.y, mx, b.y, b.x, b.y);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // --- [+] node ---------------------------------------------------------------
  {
    const pr = Math.max(9, Math.min(15, 12 * k));
    const c = headNode ? NEON[headNode.color] : NEON[0];
    const pulse = s.animate && s.changeCount ? (Math.sin(time * 4) + 1) / 2 : 0;
    ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(plusS.x, plusS.y, 0, plusS.x, plusS.y, pr * (2.4 + pulse));
    g.addColorStop(0, alpha(c, s.plusHover ? 0.55 : 0.3));
    g.addColorStop(1, alpha(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(plusS.x, plusS.y, pr * (2.4 + pulse), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    ctx.beginPath();
    ctx.arc(plusS.x, plusS.y, pr, 0, Math.PI * 2);
    ctx.fillStyle = s.plusHover ? c : "#0a0814";
    ctx.fill();
    ctx.setLineDash(s.changeCount ? [] : [3, 3]);
    ctx.strokeStyle = c;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = s.plusHover ? "#07060d" : c;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(plusS.x - pr * 0.45, plusS.y);
    ctx.lineTo(plusS.x + pr * 0.45, plusS.y);
    ctx.moveTo(plusS.x, plusS.y - pr * 0.45);
    ctx.lineTo(plusS.x, plusS.y + pr * 0.45);
    ctx.stroke();

    if (s.changeCount) {
      ctx.font = `700 10px ${MONO}`;
      const label = String(s.changeCount);
      const bw = Math.max(16, ctx.measureText(label).width + 8);
      const bx = plusS.x + pr * 0.6,
        by = plusS.y - pr - 6;
      roundRect(ctx, bx, by, bw, 15, 7.5);
      ctx.fillStyle = NEON[1];
      ctx.fill();
      ctx.fillStyle = "#07060d";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, bx + bw / 2, by + 8);
    }
  }
}
