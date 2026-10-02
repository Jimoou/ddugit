import { Icon } from "./Icon";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api";
import { blockText, conflictCount, parseConflicts, type Pick, resolveText } from "../conflict";
import type { ConflictFile, Resolution } from "../types";
import { type Key, t } from "../i18n";

interface Props {
  path: string;
  /** Files still in conflict (from the snapshot). */
  files: string[];
  /** Repository state: decides what "ours" / "theirs" mean. */
  state: string;
  initialFile?: string;
  busy: boolean;
  onResolve(file: string, how: Resolution): void;
  onClose(): void;
}

/** Side names per operation. During a rebase git's "ours" is the branch being rebased onto. */
const SIDES: Record<string, [ours: Key, theirs: Key]> = {
  merge: ["cf.side.current", "cf.side.incoming"],
  rebase: ["cf.side.base", "cf.side.mine"],
  "cherry-pick": ["cf.side.current", "cf.side.picked"],
  revert: ["cf.side.current", "cf.side.reverting"],
};

/** Bottom sheet for resolving conflicts block by block (or a whole file at once). */
export function ConflictSheet({ path, files, state, initialFile, busy, onResolve, onClose }: Props) {
  const [wanted, setFile] = useState(initialFile ?? files[0]);
  // Move on when the current file gets resolved.
  const file = wanted && files.includes(wanted) ? wanted : files[0];
  // What was loaded / picked belongs to one file; another file starts empty.
  const [loaded, setLoaded] = useState<{ file: string; data: ConflictFile | null; error: string | null } | null>(null);
  const [picked, setPicked] = useState<{ file: string; picks: (Pick | undefined)[] } | null>(null);
  // `file` is undefined once everything is resolved: compare against a real entry only.
  const mine = loaded && loaded.file === file ? loaded : null;
  const data = mine?.data ?? null;
  const error = mine?.error ?? null;
  const picks = picked && picked.file === file ? picked.picks : [];
  const sides = SIDES[state];
  const [ours, theirs] = sides ? [t(sides[0]), t(sides[1])] : ["ours", "theirs"];

  useEffect(() => {
    if (!file) return;
    let live = true;
    api.conflictFile(path, file).then(
      (d) => live && setLoaded({ file, data: d, error: null }),
      (e) => live && setLoaded({ file, data: null, error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, [path, file]);

  const segments = useMemo(() => (data ? parseConflicts(data.merged) : []), [data]);
  const total = conflictCount(segments);
  const chosen = picks.filter(Boolean).length;
  let blockNo = -1;

  return (
    <section className="diff-sheet conflict-sheet" style={{ height: "55vh" }}>
      <header>
        <div className="title">
          <span className="eyebrow danger">{t("cf.title")}</span>
          <b>{file ?? t("cf.allResolved")}</b>
          <span className="muted">{t("cf.left", { n: files.length })}</span>
        </div>
        {data && !data.binary && (
          <div className="row">
            <button disabled={busy} onClick={() => onResolve(file!, { kind: "ours" })}>
              {t("cf.wholeFile", { side: ours })}
            </button>
            <button disabled={busy} onClick={() => onResolve(file!, { kind: "theirs" })}>
              {t("cf.wholeFile", { side: theirs })}
            </button>
          </div>
        )}
        <button className="icon" onClick={onClose} title={t("common.close")}>
          <Icon name="close" />
        </button>
      </header>

      <div className="split">
        <ul className="file-list">
          {files.length === 0 && <li className="muted pad">{t("cf.done")}</li>}
          {files.map((f) => (
            <li key={f} className={f === file ? "on" : ""} onClick={() => setFile(f)}>
              <span className="chip k-conflict">!</span>
              <span className="path">{f}</span>
            </li>
          ))}
        </ul>

        <div className="diff-body conflict-body">
          {error && <p className="note warn">{error}</p>}
          {data?.binary && (
            <div className="pad row">
              <p className="muted">{t("cf.binary")}</p>
              <button disabled={busy} onClick={() => onResolve(file!, { kind: "ours" })}>
                {ours}
              </button>
              <button disabled={busy} onClick={() => onResolve(file!, { kind: "theirs" })}>
                {theirs}
              </button>
            </div>
          )}
          {data &&
            !data.binary &&
            segments.map((s, i) => {
              if (s.kind === "text")
                return (
                  <pre key={i} className="ctx">
                    {s.text}
                  </pre>
                );
              const n = ++blockNo;
              const pick = picks[n];
              const editing = typeof pick === "object";
              const choose = (p: Pick) => setPicked({ file: file!, picks: Object.assign([...picks], { [n]: p }) });
              // Start editing from the current choice, or from both sides.
              const edit = () => choose({ text: blockText(s, pick ?? "both").replace(/\r\n/g, "\n") });
              const keeps = (side: "ours" | "theirs") =>
                pick === side || pick === "both" ? "keep" : pick ? "drop" : "";
              return (
                <div key={i} className={`block ${pick ? "picked" : ""}`}>
                  <div className="block-head">
                    <span>{t("cf.block", { n: n + 1, total })}</span>
                    <span className="row">
                      {(["ours", "theirs", "both"] as const).map((p) => (
                        <button key={p} className={pick === p ? "on" : ""} onClick={() => choose(p)}>
                          {p === "ours" ? ours : p === "theirs" ? theirs : t("cf.both")}
                        </button>
                      ))}
                      <button className={editing ? "on" : ""} onClick={edit} title={t("cf.edit.title")}>
                        {t("cf.edit")}
                      </button>
                    </span>
                  </div>
                  {editing ? (
                    <textarea
                      className="block-edit"
                      spellCheck={false}
                      autoFocus
                      value={pick.text}
                      rows={Math.max(3, pick.text.split("\n").length + 1)}
                      onChange={(e) => choose({ text: e.target.value })}
                    />
                  ) : (
                    <div className="sides">
                      <pre className={`side ours ${keeps("ours")}`}>
                        <em>{ours}</em>
                        {s.ours || t("cf.empty")}
                      </pre>
                      <pre className={`side theirs ${keeps("theirs")}`}>
                        <em>
                          {theirs} {s.theirsLabel && `· ${s.theirsLabel}`}
                        </em>
                        {s.theirs || t("cf.empty")}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </div>

      {data && !data.binary && total > 0 && (
        <footer className="conflict-foot">
          <span className="muted">{t("cf.chosen", { total, n: chosen })}</span>
          <button
            className="primary"
            disabled={busy || chosen < total}
            onClick={() => onResolve(file!, { kind: "content", text: resolveText(segments, picks) })}
          >
            {t("cf.resolve")}
          </button>
        </footer>
      )}
    </section>
  );
}
