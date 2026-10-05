import { type RefObject, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import type { Effect } from "../components/Fx";
import type { GraphHandle } from "../graph/GraphCanvas";
import type { NodeBadge } from "../graph/renderer";
import type { BisectState, RepoSnapshot } from "../types";
import type { BisectDraft } from "./state";

/**
 * Bisect: the ends picked before starting, and git's state once it runs (read again for every
 * snapshot). The camera flies to each new commit to test, and flares when the culprit shows.
 */
export function useBisect(
  path: string,
  snap: RepoSnapshot | null,
  graph: RefObject<GraphHandle | null>,
  play: (e: Effect) => void,
  onCulprit: () => void,
) {
  const [draft, setDraft] = useState<BisectDraft | null>(null);
  const [loaded, setLoaded] = useState<{ snap: RepoSnapshot; state: BisectState | null } | null>(null);
  const last = useRef<{ current: string | null; culprit: string | null }>({ current: null, culprit: null });
  useEffect(() => {
    if (!snap) return;
    let live = true;
    api.bisectState(path).then(
      (state) => {
        if (!live) return;
        setLoaded({ snap, state });
        const prev = last.current;
        if (state?.culprit && state.culprit !== prev.culprit) {
          const id = state.culprit;
          onCulprit();
          setTimeout(() => {
            graph.current?.centerOn(id);
            setTimeout(() => {
              const at = graph.current?.screenOf(id);
              if (at) play({ kind: "nova", at, red: true });
            }, 450);
          }, 60);
        } else if (state?.current && state.current !== prev.current) {
          const id = state.current;
          setTimeout(() => graph.current?.centerOn(id), 60);
        }
        last.current = { current: state?.current ?? null, culprit: state?.culprit ?? null };
      },
      () => live && setLoaded({ snap, state: null }),
    );
    return () => {
      live = false;
    };
  }, [path, snap, play, onCulprit, graph]);
  const bisect = loaded && loaded.snap === snap ? loaded.state : null;

  const badges = useMemo(() => {
    const m = new Map<string, NodeBadge>();
    if (draft?.bad) m.set(draft.bad, "bad");
    if (draft?.good) m.set(draft.good, "good");
    if (bisect) {
      for (const g of bisect.good) m.set(g, "good");
      if (bisect.bad) m.set(bisect.bad, "bad");
      if (bisect.current) m.set(bisect.current, "probe");
      if (bisect.culprit) m.set(bisect.culprit, "culprit");
    }
    return m;
  }, [bisect, draft]);

  /** While hunting, everything that can't be the culprit fades back. */
  const focus = useMemo(
    () => (bisect && !bisect.culprit ? new Set([...bisect.candidates, ...bisect.good]) : null),
    [bisect],
  );

  return { bisect, draft, setDraft, badges, focus };
}
