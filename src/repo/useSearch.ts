import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { api } from "../api";
import type { GraphHandle } from "../graph/GraphCanvas";
import { HISTORY_HITS, nextLimit, searchCommits, searchKey, type SearchMode } from "../graph/search";
import { t } from "../i18n";
import type { RepoSnapshot, SearchResult } from "../types";
import type { Repo, Toast } from "./state";

interface Search {
  query: string;
  mode: SearchMode;
  regex: boolean;
  /** The current match, 0-based. */
  index: number;
}

/** What the search bar shows and does (see `SearchBar`). */
export interface SearchView extends Search {
  /** Matches to walk, newest first: loaded commits, or the whole-history results. */
  matches: string[];
  /** The whole-history answer to the query as it stands (null: not asked yet, or another mode). */
  result: SearchResult | null;
  busy: boolean;
  isLoaded(id: string): boolean;
  onQuery(query: string): void;
  onMode(mode: SearchMode): void;
  onRegex(regex: boolean): void;
  /** Enter / Shift+Enter: the next or previous match, or ask git when there is no answer yet. */
  onEnter(dir: 1 | -1): void;
  /** Go to match `i` (wrapping). */
  onPick(i: number): void;
  /** Search the whole history for the query (from the loaded mode: by message). */
  onFindAll(): void;
  onClose(): void;
}

interface Options {
  path: string;
  snap: RepoSnapshot | null;
  latest: RefObject<RepoSnapshot | null>;
  /** Read at least `n` commits of history (`useSnapshot`). */
  loadTo(n: number): Promise<RepoSnapshot | null>;
  show: Repo["show"];
  graph: RefObject<GraphHandle | null>;
  toast: Toast;
}

/**
 * The graph's search (⌘/Ctrl+F): instantly over the loaded commits, or by `git log` over the whole
 * history. A result older than the loaded history is reached by loading more of it (up to
 * `REVEAL_MAX`), so every match ends up selected in the graph and the inspector like any other.
 */
export function useSearch({ path, snap, latest, loadTo, show, graph, toast }: Options) {
  const [search, setSearch] = useState<Search | null>(null);
  const [found, setFound] = useState<{ key: string; result: SearchResult } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const key = search ? searchKey(search.mode, search.query, search.regex) : "";
  /** The search as it stands, for answers that arrive later. */
  const keyNow = useRef(key);
  useEffect(() => {
    keyNow.current = key;
  });
  /** Bumped by every jump, so a slow reveal doesn't select a match the user has moved past. */
  const jump = useRef(0);

  const result = search?.mode !== "loaded" && found?.key === key ? found.result : null;
  const [mode, query] = [search?.mode, search?.query];
  const loadedIds = useMemo(() => new Set(snap?.commits.map((c) => c.id)), [snap]);
  const matches = useMemo(() => {
    if (mode === "loaded") return snap && query !== undefined ? searchCommits(snap.commits, snap.refs, query) : [];
    return result?.hits.map((h) => h.id) ?? [];
  }, [snap, mode, query, result]);
  /** Commits to light up in the graph (null: no search to show). */
  const highlight = useMemo(
    () => (query?.trim() && (mode === "loaded" || result) ? new Set(matches) : null),
    [query, mode, result, matches],
  );

  /** Center on `id` once the graph has drawn it (right after a load it may not have yet). */
  const centerWhenDrawn = (id: string, frames = 30) => {
    if (graph.current?.screenOf(id)) graph.current.centerOn(id);
    else if (frames) requestAnimationFrame(() => centerWhenDrawn(id, frames - 1));
  };

  /** Select match `i` (wrapping) and fly to it, loading older history first if it isn't loaded. */
  const goTo = async (i: number, list = matches) => {
    if (!list.length) return;
    const index = (i + list.length) % list.length;
    setSearch((s) => s && { ...s, index });
    const id = list[index];
    const n = ++jump.current;
    let s = latest.current;
    while (s && !s.commits.some((c) => c.id === id)) {
      const more = s.truncated ? nextLimit(s.commits.length) : null;
      if (more === null) return toast("err", t("search.unreached"));
      s = await loadTo(more);
      if (n !== jump.current) return;
    }
    if (!s) return;
    show({ commit: id });
    centerWhenDrawn(id);
  };

  /** Ask git for `s`'s matches in the whole history, then go to the first. */
  const ask = async (s: Search) => {
    if (s.mode === "loaded" || !s.query.trim()) return;
    const k = searchKey(s.mode, s.query, s.regex);
    setAsking(k);
    try {
      const r = await api.searchCommits(path, s.query.trim(), s.mode, s.regex, HISTORY_HITS);
      // A late answer to an earlier question is dropped: it would hide the current one.
      if (keyNow.current !== k) return;
      setFound({ key: k, result: r });
      void goTo(
        0,
        r.hits.map((h) => h.id),
      );
    } catch (e) {
      toast("err", String(e));
    } finally {
      setAsking((a) => (a === k ? null : a));
    }
  };

  const update = (next: Search) => {
    setSearch(next);
    if (next.mode === "loaded" && snap) void goTo(0, searchCommits(snap.commits, snap.refs, next.query));
    else if (next.query.trim()) void ask(next);
  };

  const view: SearchView | null = search && {
    ...search,
    matches,
    result,
    busy: asking === key,
    isLoaded: (id) => loadedIds.has(id),
    onQuery(q) {
      // The loaded graph is searched as you type; git only on Enter.
      if (search.mode === "loaded") update({ ...search, query: q, index: 0 });
      else setSearch({ ...search, query: q, index: 0 });
    },
    onMode: (m) => update({ ...search, mode: m, index: 0 }),
    onRegex: (regex) => update({ ...search, regex, index: 0 }),
    onEnter(dir) {
      if (search.mode !== "loaded" && !result) return void (asking === key || ask(search));
      if (matches.length) return void goTo(search.index + dir);
      if (search.mode === "loaded") update({ ...search, mode: "message", index: 0 });
    },
    onPick: (i) => void goTo(i),
    onFindAll: () => update({ ...search, mode: "message", index: 0 }),
    onClose: () => setSearch(null),
  };

  const open = useCallback(() => setSearch((s) => s ?? { query: "", mode: "loaded", regex: false, index: 0 }), []);
  return { view, highlight, open };
}
