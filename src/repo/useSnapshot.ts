import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { RepoSnapshot } from "../types";
import type { Toast } from "./state";

/**
 * The repository's snapshot (history, refs, HEAD, changes): read when the tab shows, for a new
 * history size ("load more"), when files change on disk and when the window comes back to the front.
 */
export function useSnapshot(
  path: string,
  page: number,
  active: boolean,
  onLoaded: (path: string, name: string) => void,
  toast: Toast,
) {
  const [snap, setSnap] = useState<RepoSnapshot | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The snapshot last applied, for comparing before / after an operation outside render. */
  const latest = useRef<RepoSnapshot | null>(null);
  const [limit, setLimit] = useState(page);
  // A new page size from the settings applies to every open repository.
  const [shownPage, setShownPage] = useState(page);
  if (shownPage !== page) {
    setShownPage(page);
    setLimit(page);
  }

  const applySnapshot = useCallback((s: RepoSnapshot) => {
    latest.current = s;
    setSnap(s);
    setLoadError(null);
  }, []);
  /**
   * Snapshot reads overlap (the watcher, focus, ⌘R, after an operation): number them, and
   * never let an answer replace one to a later request (it may show a state git has left).
   */
  const asked = useRef(0);
  const answered = useRef(0);
  /** The last read failure already shown, so a watcher burst doesn't repeat it. */
  const shownError = useRef<string | null>(null);
  /** Callers of `loadTo` waiting for a snapshot read with at least their number of commits. */
  const waiting = useRef<{ n: number; done(s: RepoSnapshot | null): void }[]>([]);
  /** How many commits the applied snapshot was read with. */
  const readWith = useRef(0);
  const refresh = useCallback((): Promise<void> => {
    const n = ++asked.current;
    /** Answer the waiters this read covers (a failed read answers them all). */
    const settle = (s: RepoSnapshot | null) => {
      const ready = waiting.current.filter((w) => !s || w.n <= limit);
      waiting.current = waiting.current.filter((w) => !ready.includes(w));
      for (const w of ready) w.done(s);
    };
    const newest = () => {
      if (n < answered.current) return false;
      answered.current = n;
      return true;
    };
    return api.snapshot(path, limit).then(
      (s) => {
        if (!newest()) return;
        if (!latest.current) onLoaded(path, s.name);
        applySnapshot(s);
        shownError.current = null;
        readWith.current = limit;
        settle(s);
      },
      (e) => {
        if (!newest()) return;
        settle(null);
        const text = String(e);
        setLoadError(text);
        // Before the first load the error fills the tab; after it (the folder moved, say) the old graph stays up.
        if (latest.current && shownError.current !== text) toast("err", text);
        shownError.current = text;
      },
    );
  }, [path, limit, applySnapshot, onLoaded, toast]);
  const refreshNow = useRef(refresh);
  const limitNow = useRef(limit);
  useEffect(() => {
    refreshNow.current = refresh;
    limitNow.current = limit;
  });

  // Read the repository when its tab shows, and again for a new history size ("load more").
  useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  // Files and refs changed on disk (editor, terminal git) → refresh. Only the
  // visible tab watches; a new history size keeps the same watch.
  useEffect(() => {
    if (!active) return;
    let stop = () => {};
    let live = true;
    api
      .watch(path, () => void refreshNow.current())
      .then(
        (un) => (live ? (stop = un) : un()),
        () => {}, // watching is a convenience; focus refresh still works
      );
    return () => {
      live = false;
      stop();
    };
  }, [path, active]);

  // Pick up edits made in an editor when the user comes back to the window.
  useEffect(() => {
    if (!active) return;
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [active, refresh]);

  const loadMore = useCallback(() => setLimit((l) => l + page), [page]);
  /** Read at least `n` commits of history: the snapshot once applied (null if the read failed). */
  const loadTo = useCallback((n: number): Promise<RepoSnapshot | null> => {
    if (readWith.current >= n) return Promise.resolve(latest.current);
    const read = new Promise<RepoSnapshot | null>((done) => waiting.current.push({ n, done }));
    // A larger size reads by itself (the effect above); the current one may have no read on the way.
    if (n > limitNow.current) setLimit((l) => Math.max(l, n));
    else void refreshNow.current();
    return read;
  }, []);
  return { snap, loadError, latest, refresh, loadMore, loadTo };
}
