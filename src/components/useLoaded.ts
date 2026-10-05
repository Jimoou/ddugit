import { useEffect, useRef, useState } from "react";

interface Loaded<T> {
  /** The answer for the current key: null while it loads, or when it failed. */
  data: T | null;
  /** Why the current key failed to load. */
  error: string | null;
  /** The latest answer for any key: keeps a list on screen while it is read again. */
  last: T | null;
}

/**
 * What `load()` answers for `key`, read again whenever the key changes (a null key reads nothing).
 * The key names everything the answer depends on; one that lands after the key moved on is dropped.
 */
export function useLoaded<T>(key: string | null, load: () => Promise<T>): Loaded<T> {
  const [got, setGot] = useState<{ key: string; data: T | null; error: string | null; last: T | null } | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    if (key === null) return;
    let live = true;
    loader.current().then(
      (data) => live && setGot({ key, data, error: null, last: data }),
      (e) => live && setGot((g) => ({ key, data: null, error: String(e), last: g?.last ?? null })),
    );
    return () => {
      live = false;
    };
  }, [key]);
  const mine = got && got.key === key ? got : null;
  return { data: mine?.data ?? null, error: mine?.error ?? null, last: got?.last ?? null };
}
