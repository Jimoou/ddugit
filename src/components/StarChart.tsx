// The dashboard's star chart: every repository a star, each group a
// constellation. Distance from the centre is how long ago the last commit was;
// size is how recent; colour is the most urgent thing about it (galaxy.ts `tone`).
// Mouse only: the list beside it holds the same repositories as real buttons.
// The circle fits the space it has; names stay the same size whatever it is.

import {
  type Box,
  CHART_R,
  CHART_RINGS,
  type Constellation,
  overlaps,
  placeLabels,
  signals,
  textWidth,
  tone,
} from "../galaxy";
import { useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { repoName } from "../recent";
import type { RepoGlance } from "../types";

/** Room (px) around the circle for names that hang off the outermost stars, and under it for the legend. */
const PAD_X = 120;
const PAD_Y = 26;
const LEGEND_H = 40;
/** The circle never gets smaller than this (px); a narrower window shows the list alone (welcome.css). */
const MIN_R = 110;
const LEGEND = ["clean", "changes", "behind", "stopped", "missing"] as const;

interface Props {
  constellations: Constellation[];
  groupName(id: string): string;
  glanceOf(path: string): RepoGlance | undefined;
  locked: Set<string>;
  hovered: string | null;
  picked: string[];
  onHover(path: string | null): void;
  onStar(path: string, e: React.MouseEvent): void;
  onMenu(path: string, e: React.MouseEvent): void;
}

export function StarChart(p: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const [area, setArea] = useState({ w: 900, h: 640 });
  useLayoutEffect(() => {
    const el = svg.current;
    if (!el) return;
    const read = () => {
      const r = el.getBoundingClientRect();
      setArea((a) => (a.w === r.width && a.h === r.height ? a : { w: r.width, h: r.height }));
    };
    read();
    const watch = new ResizeObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  // From the chart's units (CHART_R) to pixels.
  const k = Math.max(MIN_R, Math.min(area.w / 2 - PAD_X, (area.h - LEGEND_H) / 2 - PAD_Y)) / CHART_R;
  const stars = p.constellations.flatMap((c) => c.stars.map((s) => ({ ...s, x: s.x * k, y: s.y * k })));
  const labelOf = (c: Constellation) => ({ ...c.label, x: c.label.x * k, y: c.label.y * k });
  /** The line under a name: its branch and the two most urgent things about it. */
  const subOf = (path: string) => {
    const g = p.glanceOf(path);
    if (!g || g.error || p.locked.has(path)) return null;
    return {
      branch: g.branch ?? t("galaxy.detached"),
      lit: signals(g)
        .slice(0, 2)
        .map((l) => ({ signal: l.signal, text: t(`galaxy.sig.${l.signal}`, { n: l.n }) })),
    };
  };
  const subText = (sub: NonNullable<ReturnType<typeof subOf>>) =>
    [sub.branch, ...sub.lit.map((l) => l.text)].join(" · ");
  // Names go down biggest (most recent) first; the marks that never move are in the way from the start.
  const ringMark = (r: number): Box => ({ x: 0, y: r + 2, w: 30, h: 14 });
  const groupMark = (c: Constellation): Box => {
    const width = textWidth(p.groupName(c.id ?? ""), 11) + 10;
    const at = labelOf(c);
    const x = at.anchor === "start" ? at.x : at.anchor === "end" ? at.x - width : at.x - width / 2;
    return { x, y: at.y - 12, w: width, h: 16 };
  };
  const groupMarks = p.constellations.filter((c) => c.id).map(groupMark);
  const order = [...stars].sort((a, b) => b.size - a.size);
  const placed = new Map(
    placeLabels(
      order.map((s) => {
        const sub = subOf(s.path);
        return { ...s, name: textWidth(repoName(s.path), 13), sub: sub ? textWidth(subText(sub), 11.5) : 0 };
      }),
      [...CHART_RINGS.map((r) => ringMark(r.r * k)), ...groupMarks],
    ).map((at, i) => [order[i].path, at]),
  );
  // The one under the pointer is drawn last, over its neighbours.
  const drawn = [...stars].sort((a, b) => Number(a.path === p.hovered) - Number(b.path === p.hovered));
  return (
    <div className="star-chart">
      <svg
        ref={svg}
        viewBox={`${-area.w / 2} ${LEGEND_H / 2 - area.h / 2} ${area.w} ${area.h}`}
        role="img"
        aria-label={t("galaxy.chart", { n: stars.length })}
      >
        <g className="chart-grid">
          {CHART_RINGS.map((ring) => (
            <circle key={ring.label} r={ring.r * k} />
          ))}
          {[0, 30, 60, 90, 120, 150].map((deg) => {
            const a = (deg * Math.PI) / 180;
            const [x, y] = [Math.cos(a) * CHART_R * k, Math.sin(a) * CHART_R * k];
            return <line key={deg} x1={-x} y1={-y} x2={x} y2={y} />;
          })}
        </g>
        <g className="chart-rings">
          {CHART_RINGS.map(
            (ring) =>
              !groupMarks.some((m) => overlaps(m, ringMark(ring.r * k))) && (
                <text key={ring.label} x={4} y={ring.r * k + 13}>
                  {t(`galaxy.ring.${ring.label}`)}
                </text>
              ),
          )}
        </g>
        {p.constellations.map(
          (c) =>
            c.id &&
            c.stars.length > 1 && (
              <polyline
                key={c.id}
                className="constellation"
                points={c.stars.map((s) => `${s.x * k},${s.y * k}`).join(" ")}
              />
            ),
        )}
        {p.constellations.map(
          (c) =>
            c.id && (
              <text
                key={c.id}
                className="constellation-name"
                x={labelOf(c).x}
                y={labelOf(c).y}
                textAnchor={c.label.anchor}
              >
                {p.groupName(c.id)}
              </text>
            ),
        )}
        {drawn.map((s) => {
          const locked = p.locked.has(s.path);
          const hot = p.hovered === s.path;
          // A name with no room shows while the pointer is on it; the list beside lights the same row with the rest.
          const at = placed.get(s.path) ?? (hot ? { side: s.x >= 0 ? "right" : "left", sub: false } : null);
          const sub = at?.sub ? subOf(s.path) : null;
          const right = at?.side === "right";
          const dx = right ? s.size + 8 : -(s.size + 8);
          const anchor = right ? "start" : "end";
          return (
            <g
              key={s.path}
              className={`chart-star tone-${locked ? "unread" : tone(p.glanceOf(s.path))} ${hot ? "hot" : ""} ${p.picked.includes(s.path) ? "picked" : ""}`}
              transform={`translate(${s.x} ${s.y})`}
              onMouseEnter={() => p.onHover(s.path)}
              onMouseLeave={() => p.onHover(null)}
              onClick={(e) => p.onStar(s.path, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                p.onMenu(s.path, e);
              }}
            >
              <circle className="hit" r={s.size + 10} />
              <circle className="ring" r={s.size + 7} />
              <circle className="dot" r={s.size} />
              {at && (
                <text className="star-name" x={dx} y={4} textAnchor={anchor}>
                  {repoName(s.path)}
                </text>
              )}
              {at && sub && (
                <text className="star-sub" x={dx} y={20} textAnchor={anchor}>
                  {sub.branch}
                  {sub.lit.map((l) => (
                    <tspan key={l.signal} className={`sig-${l.signal}`}>
                      {" · "}
                      {l.text}
                    </tspan>
                  ))}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {LEGEND.map((k) => (
          <span key={k} className={`tone-${k}`}>
            <i aria-hidden />
            {t(`galaxy.legend.${k}`)}
          </span>
        ))}
        <span className="muted">{t("galaxy.legend.how")}</span>
      </div>
    </div>
  );
}
