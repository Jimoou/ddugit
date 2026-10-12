import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CommitInfo, RefInfo } from "../types";
import type { Layout, LayoutEdge } from "./layout";
import type { GraphHandle } from "./GraphCanvas";
import type { NodeBadge } from "./renderer";
import type { Pt } from "./scene";
import { fmtTime } from "../format";
import { t } from "../i18n";
import { isOnScreen, isTypingTarget } from "../keys";
import { hasOpenLayer } from "../components/useDialog";

/** Row height and the header above the rows, px (match `.commit-list` in stage.css). */
export const LIST_ROW = 28;
const HEAD_H = 28;
/** Graph column: a lane every `LANE_W`, at most `MAX_LANES` before the column stops growing. */
const LANE_W = 14;
const PAD = 8;
const MAX_LANES = 12;
/** Rows drawn beyond the viewport, each way. */
const OVERSCAN = 20;
const BADGE_MAX = 3;

interface Props {
  layout: Layout;
  commits: Map<string, CommitInfo>;
  refs: RefInfo[];
  /** A ref's colour, as on the map. */
  refColor(r: RefInfo): string;
  lanes: readonly string[];
  headId: string | null;
  headBranch: string | null;
  changeCount: number;
  selected: string | null;
  picked?: Set<string>;
  focus: Set<string> | null;
  badges?: Map<string, NodeBadge>;
  truncated: boolean;
  onSelect(id: string | null): void;
  onClear?(): void;
  onPick?(id: string, range: boolean): void;
  onPlus(): void;
  onNodeMenu(id: string, x: number, y: number): void;
  onRefMenu(ref: RefInfo, x: number, y: number): void;
  onLoadMore(): void;
}

const KIND_ORDER: Record<RefInfo["kind"], number> = { local: 0, pr: 1, remote: 2, tag: 3 };
const BADGE_TEXT: Record<NodeBadge, () => string> = {
  good: () => t("bisect.good"),
  bad: () => t("bisect.bad"),
  probe: () => t("list.probe"),
  culprit: () => t("list.culprit"),
};

const laneX = (lane: number) => PAD + lane * LANE_W + LANE_W / 2;

/** One edge through the rows `y(row)` maps to the canvas: down its lane, curving in and out at the ends. */
function edgePath(ctx: CanvasRenderingContext2D, e: LayoutEdge, y: (row: number) => number) {
  const ax = laneX(e.childLane),
    ay = y(e.childRow);
  const bx = laneX(e.parentLane),
    by = y(e.parentRow);
  const vx = laneX(e.via);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  if (e.childLane === e.via && e.parentLane === e.via) {
    ctx.lineTo(bx, by);
    return;
  }
  if (e.parentRow - e.childRow <= 1) {
    ctx.bezierCurveTo(ax, ay + LIST_ROW / 2, bx, by - LIST_ROW / 2, bx, by);
    return;
  }
  let cy = ay;
  if (e.childLane !== e.via) {
    cy = ay + LIST_ROW;
    ctx.bezierCurveTo(ax, ay + LIST_ROW / 2, vx, cy - LIST_ROW / 2, vx, cy);
  }
  if (e.parentLane === e.via) {
    ctx.lineTo(bx, by);
    return;
  }
  const turnAt = by - LIST_ROW;
  if (turnAt > cy) ctx.lineTo(vx, turnAt);
  ctx.bezierCurveTo(vx, turnAt + LIST_ROW / 2, bx, by - LIST_ROW / 2, bx, by);
}

/**
 * The history as a list: one row per commit, newest on top, with a narrow
 * graph column (lanes and merges as on the map), its branch and tag labels,
 * summary, author, date and id. Rows near the viewport are drawn; the graph
 * column is one canvas redrawn as the list scrolls. Answers the same handle
 * as the map, so search, menus and bisect can bring a commit into view.
 */
export const CommitList = forwardRef<GraphHandle, Props>(function CommitList(props, ref) {
  const { layout, commits, refs, headId, selected, changeCount } = props;
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [range, setRange] = useState({ start: 0, end: 60 });
  const [height, setHeight] = useState(600);

  const wip = changeCount > 0 && !!headId && layout.byId.has(headId);
  /** Rows above the first commit (the working tree). */
  const lead = wip ? 1 : 0;
  const rowCount = layout.rowCount;
  const total = (rowCount + lead) * LIST_ROW + (props.truncated ? LIST_ROW : 0);
  const lanesShown = Math.min(Math.max(layout.laneCount, 1), MAX_LANES);
  const graphW = PAD * 2 + lanesShown * LANE_W;

  const refsAt = useMemo(() => {
    const m = new Map<string, RefInfo[]>();
    for (const r of refs) {
      const list = m.get(r.target);
      if (list) list.push(r);
      else m.set(r.target, [r]);
    }
    const head = props.headBranch;
    for (const list of m.values())
      list.sort(
        (a, b) =>
          Number(b.kind === "local" && b.name === head) - Number(a.kind === "local" && a.name === head) ||
          KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
          a.name.localeCompare(b.name),
      );
    return m;
  }, [refs, props.headBranch]);

  /** Top of a commit's row inside the scrolled content (below the header). */
  const rowTop = (row: number) => (row + lead) * LIST_ROW;

  const draw = () => {
    const c = canvas.current,
      el = box.current;
    if (!c || !el) return;
    const p = propsRef.current;
    const dpr = window.devicePixelRatio || 1;
    const h = Math.max(0, el.clientHeight - HEAD_H);
    if (c.width !== Math.round(graphW * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(graphW * dpr);
      c.height = Math.round(h * dpr);
      c.style.width = `${graphW}px`;
      c.style.height = `${h}px`;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, graphW, h);
    const scroll = el.scrollTop;
    const y = (row: number) => rowTop(row) + LIST_ROW / 2 - scroll;
    const first = Math.floor(scroll / LIST_ROW) - lead - 1;
    const last = first + Math.ceil(h / LIST_ROW) + 2;
    const dim = (id: string) => (p.focus && !p.focus.has(id) ? 0.3 : 1);
    ctx.lineWidth = 1.6;
    for (const e of layout.edges) {
      if (e.parentRow < first || e.childRow > last) continue;
      ctx.globalAlpha = Math.min(dim(e.child), dim(e.parent)) * (e.isMergeEdge ? 0.85 : 1);
      ctx.strokeStyle = p.lanes[e.color] ?? p.lanes[0];
      edgePath(ctx, e, y);
      ctx.stroke();
    }
    const style = getComputedStyle(el);
    const bg = style.getPropertyValue("--bg").trim() || "#000";
    const ink = style.getPropertyValue("--text").trim() || "#fff";
    if (wip && p.headId) {
      const node = layout.byId.get(p.headId)!;
      const x = laneX(node.lane);
      ctx.globalAlpha = 1;
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = p.lanes[node.color] ?? p.lanes[0];
      ctx.beginPath();
      ctx.moveTo(x, LIST_ROW / 2 - scroll);
      ctx.lineTo(x, y(node.row));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(x, LIST_ROW / 2 - scroll, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.stroke();
    }
    for (let row = Math.max(0, first); row <= Math.min(rowCount - 1, last); row++) {
      const n = layout.nodes[row];
      if (!n) continue;
      const x = laneX(n.lane),
        cy = y(row);
      const col = p.lanes[n.color] ?? p.lanes[0];
      ctx.globalAlpha = dim(n.id);
      ctx.beginPath();
      ctx.arc(x, cy, n.isMerge ? 3.5 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = n.isMerge ? bg : col;
      ctx.fill();
      ctx.strokeStyle = col;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      if (n.id === p.headId || n.id === p.selected) {
        ctx.beginPath();
        ctx.arc(x, cy, 7.5, 0, Math.PI * 2);
        ctx.strokeStyle = n.id === p.selected ? ink : col;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  };
  const drawRef = useRef(draw);
  drawRef.current = draw;

  // Which rows to render, and the graph redrawn on every scroll.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const top = Math.floor(el.scrollTop / LIST_ROW) - lead;
        const rows = Math.ceil(el.clientHeight / LIST_ROW);
        const start = Math.max(0, top - OVERSCAN),
          end = Math.min(rowCount, top + rows + OVERSCAN);
        setRange((r) => (r.start === start && r.end === end ? r : { start, end }));
        setHeight(el.clientHeight);
        drawRef.current();
        // Near the end of what is loaded: read older history.
        const p = propsRef.current;
        if (p.truncated && el.scrollTop + el.clientHeight > total - LIST_ROW * 6) p.onLoadMore();
      });
    };
    read();
    el.addEventListener("scroll", read, { passive: true });
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", read);
      ro.disconnect();
    };
  }, [rowCount, lead, total]);
  // Anything drawn changed: redraw now (not only on the next scroll).
  useLayoutEffect(() => {
    drawRef.current();
  });

  const scrollToRow = (row: number, onlyIfHidden: boolean) => {
    const el = box.current;
    if (!el) return;
    const top = rowTop(row);
    const view = el.clientHeight - HEAD_H;
    if (onlyIfHidden && top >= el.scrollTop && top + LIST_ROW <= el.scrollTop + view) return;
    el.scrollTop = Math.max(0, top - (view - LIST_ROW) / 2);
  };
  const rowOf = (id: string | null | undefined) => (id ? layout.byId.get(id)?.row : undefined);
  /** Where a commit's dot is, relative to the list (null if not loaded). */
  const screenOf = (id: string): Pt | null => {
    const row = rowOf(id);
    const el = box.current;
    if (row === undefined || !el) return null;
    return { x: laneX(layout.nodes[row].lane), y: HEAD_H + rowTop(row) + LIST_ROW / 2 - el.scrollTop };
  };
  const api: GraphHandle = {
    centerOn(id) {
      const row = rowOf(id);
      if (row !== undefined) scrollToRow(row, false);
    },
    centerOnHead() {
      const row = rowOf(propsRef.current.headId);
      if (row !== undefined) scrollToRow(row, false);
    },
    fit() {
      if (box.current) box.current.scrollTop = 0;
    },
    zoomBy() {},
    screenOf,
  };
  useImperativeHandle(ref, () => api);
  const reveal = (id: string) => {
    const row = rowOf(id);
    if (row !== undefined) scrollToRow(row, true);
  };

  // Dev-only hook so e2e scripts can find rows on screen.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    (window as unknown as Record<string, unknown>).__ddugit = {
      screenOf(id: string): Pt | null {
        const p = screenOf(id);
        const r = box.current?.getBoundingClientRect();
        return p && r ? { x: p.x + r.left, y: p.y + r.top } : null;
      },
      stashScreenOf: () => null,
      centerOn: (id: string) => api.centerOn(id),
      reveal,
    };
  });

  // Keys: arrows move the selection, Enter opens its menu, Esc lets go, H goes to HEAD.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.defaultPrevented) return;
      if ((e.target as Element).closest?.("[aria-modal]")) return;
      if (!isOnScreen(box.current)) return;
      const p = propsRef.current;
      if (e.key === "Escape") {
        if (hasOpenLayer()) return;
        p.onSelect(null);
        p.onClear?.();
        return;
      }
      if (e.key === "h" || e.key === "H") return api.centerOnHead();
      const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10 };
      const moves = e.key in steps || e.key === "Home" || e.key === "End";
      if (!moves && e.key !== "Enter" && e.key !== "ContextMenu") return;
      // Only when nothing else has focus: arrows must still scroll sheets.
      if (e.target !== document.body && e.target !== box.current) return;
      e.preventDefault();
      const cur = rowOf(p.selected);
      if (moves) {
        const from = cur ?? rowOf(p.headId) ?? 0;
        const to =
          e.key === "Home"
            ? 0
            : e.key === "End"
              ? rowCount - 1
              : cur === undefined
                ? from
                : Math.min(rowCount - 1, Math.max(0, from + steps[e.key]));
        const id = layout.nodes[to]?.id;
        if (id) {
          p.onSelect(id);
          scrollToRow(to, true);
        }
      } else if (cur !== undefined && p.selected) {
        const at = screenOf(p.selected);
        const r = box.current!.getBoundingClientRect();
        if (at) p.onNodeMenu(p.selected, r.left + graphW + 24, r.top + at.y + 8);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const click = (id: string, e: React.MouseEvent) => {
    const p = propsRef.current;
    if (e.metaKey || e.ctrlKey) p.onPick?.(id, false);
    else if (e.shiftKey) p.onPick?.(id, true);
    else p.onSelect(id);
  };

  const rows = [];
  for (let row = range.start; row < range.end; row++) {
    const n = layout.nodes[row];
    const c = n && commits.get(n.id);
    if (!c) continue;
    const at = refsAt.get(c.id) ?? [];
    const badge = props.badges?.get(c.id);
    const cls = [
      "cl-row",
      c.id === selected ? "on" : "",
      props.picked?.has(c.id) ? "picked" : "",
      props.focus && !props.focus.has(c.id) ? "dim" : "",
      c.id === headId ? "head" : "",
    ].join(" ");
    rows.push(
      <div
        key={c.id}
        className={cls}
        role="option"
        aria-selected={c.id === selected}
        data-id={c.id}
        style={{ top: rowTop(row), gridTemplateColumns: `${graphW}px minmax(0, 1fr) auto auto auto` }}
        onClick={(e) => click(c.id, e)}
        onContextMenu={(e) => {
          e.preventDefault();
          props.onNodeMenu(c.id, e.clientX, e.clientY);
        }}
      >
        <span className="cl-graph" />
        <span className="cl-msg">
          {at.slice(0, BADGE_MAX).map((r) => (
            <span
              key={`${r.kind}:${r.name}`}
              className={`cl-ref ${r.kind} ${r.kind === "local" && r.name === props.headBranch ? "current" : ""}`}
              style={{ "--ref": props.refColor(r) } as React.CSSProperties}
              title={r.name}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                props.onRefMenu(r, e.clientX, e.clientY);
              }}
            >
              {r.kind === "tag" ? `◇ ${r.name}` : r.name}
            </span>
          ))}
          {at.length > BADGE_MAX && (
            <span className="cl-more" title={at.map((r) => r.name).join("\n")}>
              +{at.length - BADGE_MAX}
            </span>
          )}
          {badge && <span className={`cl-badge ${badge}`}>{BADGE_TEXT[badge]()}</span>}
          <span className="cl-summary" title={c.message}>
            {c.summary}
          </span>
        </span>
        <span className="cl-author">{c.author}</span>
        <span className="cl-date">
          {fmtTime(c.time, new Date(c.time * 1000).getFullYear() !== new Date().getFullYear())}
        </span>
        <code className="cl-sha">{c.id.slice(0, 7)}</code>
      </div>,
    );
  }

  return (
    <div
      className="commit-list"
      ref={box}
      tabIndex={0}
      role="listbox"
      aria-label={t("list.aria")}
      aria-multiselectable
      onClick={(e) => {
        if (e.target === e.currentTarget || (e.target as Element).classList.contains("cl-body")) {
          props.onSelect(null);
          props.onClear?.();
        }
      }}
    >
      <div className="cl-head" style={{ gridTemplateColumns: `${graphW}px minmax(0, 1fr) auto auto auto` }}>
        <span />
        <span>{t("list.col.message")}</span>
        <span className="cl-author">{t("list.col.author")}</span>
        <span className="cl-date">{t("list.col.date")}</span>
        <span className="cl-sha">{t("list.col.commit")}</span>
      </div>
      <div className="cl-canvas" aria-hidden>
        <canvas ref={canvas} style={{ height: Math.max(0, height - HEAD_H) }} />
      </div>
      <div className="cl-body" style={{ height: total }}>
        {wip && (
          <div
            className="cl-row wip"
            style={{ top: 0, gridTemplateColumns: `${graphW}px minmax(0, 1fr)` }}
            onClick={() => props.onPlus()}
          >
            <span className="cl-graph" />
            <span className="cl-msg">
              <span className="cl-summary">{t("list.wip", { n: changeCount })}</span>
            </span>
          </div>
        )}
        {rows}
        {props.truncated && (
          <button className="cl-more-rows" style={{ top: rowTop(rowCount) }} onClick={() => props.onLoadMore()}>
            {t("graph.loadMore")}
          </button>
        )}
      </div>
    </div>
  );
});
