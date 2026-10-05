import { Icon } from "./Icon";
import { useEffect, useState } from "react";
import { api } from "../api";
import { fmtTime } from "../format";
import { t } from "../i18n";
import type { Blame } from "../types";
import { useDialog } from "./useDialog";

/** Star temperature for a line's age: old lines glow a cool, dim red; the newest a hot blue-white. */
export function ageColor(time: number, oldest: number, newest: number): string {
  const f = newest > oldest ? Math.min(1, Math.max(0, (time - oldest) / (newest - oldest))) : 1;
  // red giant → gold → white → blue
  const stops: [number, number, number][] = [
    [255, 107, 107],
    [255, 212, 121],
    [240, 240, 255],
    [140, 200, 255],
  ];
  const x = f * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const u = x - i;
  const [r, g, b] = stops[i].map((c, j) => Math.round(c + (stops[i + 1][j] - c) * u));
  return `rgb(${r}, ${g}, ${b})`;
}

/** Who last changed each line of a file, as of one commit; a hunk's gutter jumps to its commit. */
export function BlameSheet(p: {
  path: string;
  rev: string;
  file: string;
  /** Commit selected in the graph: its lines light up. */
  selected: string | null;
  onSelect(id: string): void;
  onClose(): void;
}) {
  const [loaded, setLoaded] = useState<{ key: string; blame: Blame | null; error: string | null } | null>(null);
  const { path, rev, file } = p;
  const key = `${rev}:${file}`;
  useEffect(() => {
    let live = true;
    api.blame(path, rev, file).then(
      (blame) => live && setLoaded({ key, blame, error: null }),
      (e) => live && setLoaded({ key, blame: null, error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, [path, rev, file, key]);
  const { onClose } = p;
  const cur = loaded?.key === key ? loaded : null;
  const blame = cur?.blame ?? null;
  const times = blame?.hunks.map((h) => h.time) ?? [];
  const oldest = Math.min(...times),
    newest = Math.max(...times);

  const sheet = useDialog(onClose, false);
  return (
    <section className="diff-sheet blame-sheet" style={{ height: "50vh" }} {...sheet}>
      <header>
        <div className="title">
          <span className="eyebrow">{t("history.blame.title")}</span>
          <code>{file}</code>
          <span className="muted">
            {t("history.blame.at", { sha: rev.slice(0, 7) })} · {t("history.blame.hint")}
          </span>
        </div>
        <button className="icon" onClick={onClose} title={t("common.closeEsc")} aria-label={t("common.close")}>
          <Icon name="close" />
        </button>
      </header>
      {cur?.error && <p className="note warn pad">{cur.error}</p>}
      {!cur && <p className="muted pad">{t("diff.loading")}</p>}
      {blame && (
        <div className="blame-body">
          {blame.hunks.map((h) => {
            const color = ageColor(h.time, oldest, newest);
            return (
              <div
                key={`${h.start}-${h.commit}`}
                className={`blame-hunk ${h.commit === p.selected ? "on" : ""}`}
                style={{ ["--star" as string]: color }}
              >
                <button
                  className="blame-gutter"
                  onClick={() => p.onSelect(h.commit)}
                  title={`${h.summary}\n${h.author} · ${fmtTime(h.time)}`}
                >
                  <i className="star" />
                  <code>{h.commit.slice(0, 7)}</code>
                  <span className="who">{h.author}</span>
                  <span className="muted">{fmtTime(h.time, false)}</span>
                </button>
                <pre className="blame-lines">
                  {blame.lines.slice(h.start, h.start + h.len).map((l, i) => (
                    <div key={i}>
                      <span className="ln">{h.start + i + 1}</span>
                      {l || " "}
                    </div>
                  ))}
                </pre>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
