import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api";
import { rebaseRange } from "../rebasePlan";
import type { CommitInfo, RepoSnapshot, TodoItem } from "../types";
import type { DiffSource, Sheet, Toast } from "./state";

/**
 * The sheet under the graph (one at a time) and the conflict sheet that goes over it: the open
 * diff's files (the working-tree diff follows the files on disk), and the planned rebase's commits.
 */
export function useSheet(path: string, snap: RepoSnapshot | null, commitById: Map<string, CommitInfo>, toast: Toast) {
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [conflict, setConflict] = useState<{ file?: string } | null>(null);
  // When the stopped operation ends (cancelled, finished, or outside the app) and nothing is left in
  // conflict, the conflict sheet has nothing to say, and it would hide every sheet under it: close it.
  // Only on that change: right after an operation stops, the sheet opens before the snapshot shows it.
  const stopped = !!snap && (snap.state !== "clean" || snap.changes.some((c) => c.conflicted));
  const [wasStopped, setWasStopped] = useState(stopped);
  if (wasStopped !== stopped) {
    setWasStopped(stopped);
    if (!stopped) setConflict(null);
  }
  const diffReq = useRef(0);

  /** Fetch the files for the open diff; only the latest request may land. */
  const fetchDiff = useCallback(
    (source: DiffSource) => {
      if (!path) return;
      const req = ++diffReq.current;
      const load =
        source.kind === "commit"
          ? api.commitDiff(path, source.id)
          : source.kind === "range"
            ? api.rangeDiff(path, source.from.id, source.to.id, source.mergeBase)
            : api.worktreeDiff(path, null, source.scope);
      const land = (files: Awaited<typeof load>, error: string | null) =>
        req === diffReq.current && setSheet((s) => (s?.kind === "diff" ? { ...s, files, error: error ?? s.error } : s));
      load.then(
        (files) => land(files, null),
        (e) => land([], String(e)),
      );
    },
    [path],
  );

  const loadDiff = useCallback(
    (source: DiffSource, title: string, file?: string) => {
      setSheet((s) => ({
        kind: "diff",
        source,
        title,
        files: s?.kind === "diff" && s.title === title ? s.files : null,
        error: null,
        path: file,
      }));
      fetchDiff(source);
    },
    [fetchDiff],
  );

  // The working-tree diff follows the files on disk (only the files are refetched).
  const worktreeSource = sheet?.kind === "diff" && sheet.source.kind === "worktree" ? sheet.source : null;
  useEffect(() => {
    if (worktreeSource) fetchDiff(worktreeSource);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap]);

  // A range with merges (or off the first-parent line) is planned over git's own todo,
  // read for this opening of the sheet.
  const planning = sheet?.kind === "rebase" ? sheet : null;
  const head = snap?.head.target;
  const needsTodo = !!planning && !!head && typeof rebaseRange(commitById, head, planning.from) === "string";
  const [todo, setTodo] = useState<{ for: Sheet; todo: TodoItem[] } | null>(null);
  useEffect(() => {
    if (!needsTodo || !planning) return;
    let live = true;
    api.rebaseTodo(path, planning.from).then(
      (list) => live && setTodo({ for: planning, todo: list }),
      (e) => {
        if (!live) return;
        toast("err", String(e));
        setSheet((s) => (s === planning ? null : s));
      },
    );
    return () => {
      live = false;
    };
  }, [needsTodo, planning, path, toast]);
  const rebaseTodo = todo && todo.for === planning ? todo.todo : null;

  // Commits the planned rebase rewrites (and git's todo when merges are in it); null when there is nothing to plan.
  const rebase = useMemo(() => {
    if (!planning || !head) return null;
    const r = rebaseRange(commitById, head, planning.from);
    if (typeof r !== "string") return r.length ? { commits: r, todo: null } : null;
    if (!rebaseTodo) return null;
    const commits = rebaseTodo.flatMap((x): CommitInfo[] =>
      x.kind === "pick"
        ? [
            commitById.get(x.id) ?? {
              id: x.id,
              parents: [],
              summary: x.summary,
              message: x.summary,
              author: "",
              email: "",
              time: 0,
            },
          ]
        : [],
    );
    return commits.length ? { commits, todo: rebaseTodo } : null;
  }, [planning, rebaseTodo, head, commitById]);

  return { sheet, setSheet, conflict, setConflict, loadDiff, rebase };
}
