import { useCallback, useRef, useState } from "react";

type Pt = { x: number; y: number };

/** One-shot effects over the graph, played at result moments (screen coordinates). */
export type Effect =
  /** An edited commit (or the bisect culprit, red) flares. */
  | { kind: "nova"; at: Pt; red?: boolean }
  /** Deleted branch tips scatter. */
  | { kind: "dust"; at: Pt[] }
  /** A reset winds the sky back. */
  | { kind: "rewind" }
  /** A push: a comet climbs from HEAD into orbit along a drawn trajectory. */
  | { kind: "launch"; from: Pt }
  /** A fetch / pull: meteors fall onto the commits that arrived. */
  | { kind: "meteors"; to: Pt[] };

type Playing = Effect & { id: number };

/** Long enough for every effect's CSS animation (the longest staggered meteor ends by ~1.6s). */
const LIFE_MS = 2200;
/** More would just be noise. */
const MAX_METEORS = 6;

/** The effects playing now and `play` to start one; nothing plays while sparkles are off. */
export function useFx(enabled: boolean) {
  const [playing, setPlaying] = useState<Playing[]>([]);
  const seq = useRef(0);
  const play = useCallback(
    (e: Effect) => {
      if (!enabled) return;
      const id = ++seq.current;
      setPlaying((l) => [...l, { ...e, id }]);
      setTimeout(() => setPlaying((l) => l.filter((x) => x.id !== id)), LIFE_MS);
    },
    [enabled],
  );
  return { playing, play };
}

/** Where the push trajectory goes from HEAD: up and right, out of the sky. */
const ORBIT = "M0 0 Q 30 -170 230 -300";

export function FxLayer({ playing }: { playing: Playing[] }) {
  if (!playing.length) return null;
  return (
    <div className="fx-clip" aria-hidden>
      {playing.map((e) => (
        <One key={e.id} e={e} />
      ))}
    </div>
  );
}

function One({ e }: { e: Effect }) {
  switch (e.kind) {
    case "nova":
      return <div className={`nova ${e.red ? "red" : ""}`} style={{ left: e.at.x, top: e.at.y }} />;
    case "dust":
      return (
        <>
          {e.at.map((p, i) => (
            <div key={i} className="stardust" style={{ left: p.x, top: p.y }}>
              {Array.from({ length: 16 }, (_, j) => (
                <i
                  key={j}
                  style={{
                    ["--a" as string]: `${j * 22.5}deg`,
                    ["--d" as string]: `${44 + ((j * 7) % 5) * 13}px`,
                  }}
                />
              ))}
            </div>
          ))}
        </>
      );
    case "rewind":
      return <div className="rewind" />;
    case "launch":
      return (
        <div className="launch" style={{ left: e.from.x, top: e.from.y }}>
          <svg className="trajectory" width="1" height="1" overflow="visible">
            <path d={ORBIT} pathLength={1} />
          </svg>
          <i className="comet" style={{ offsetPath: `path("${ORBIT}")` }} />
        </div>
      );
    case "meteors":
      return (
        <>
          {e.to.slice(0, MAX_METEORS).map((p, i) => (
            <div key={i} className="meteor" style={{ left: p.x, top: p.y, ["--delay" as string]: `${i * 130}ms` }} />
          ))}
        </>
      );
  }
}
