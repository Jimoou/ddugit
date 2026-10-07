import { useEffect, useRef } from "react";
import { Icon } from "./Icon";
import { Segmented } from "./Segmented";
import { fmtTime } from "../format";
import type { SearchMode } from "../graph/search";
import { t, type Key } from "../i18n";
import type { SearchView } from "../repo/useSearch";

interface Props {
  search: SearchView;
}

const MODES: readonly SearchMode[] = ["loaded", "message", "author", "path", "content"];
/** Modes whose query can be a regex (a path is a pathspec: folders and globs). */
const REGEX: readonly SearchMode[] = ["message", "author", "content"];

/**
 * Floating search over the graph (⌘/Ctrl+F). Typing searches the loaded commits at once; the other
 * modes ask git about the whole history on Enter and list what it found. Enter / Shift+Enter walk
 * the matches.
 */
export function SearchBar({ search: s }: Props) {
  const history = s.mode !== "loaded";
  const asked = !history || !!s.result;
  const count = !s.query.trim()
    ? ""
    : s.busy
      ? t("search.busy")
      : !asked
        ? ""
        : s.matches.length
          ? `${s.index + 1} / ${s.matches.length}${s.result?.more ? "+" : ""}`
          : t("common.none");
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    list.current?.querySelector(".on")?.scrollIntoView({ block: "nearest" });
  }, [s.index, s.result]);

  return (
    <div className="search-bar" role="search">
      <div className="search-row">
        <Icon name="search" className="ico" />
        <input
          autoFocus
          placeholder={t(`search.placeholder${history ? `.${s.mode}` : ""}` as Key)}
          value={s.query}
          onChange={(e) => s.onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") s.onEnter(e.shiftKey ? -1 : 1);
            if (e.key === "Escape") s.onClose();
          }}
        />
        <span className="count">{count}</span>
        <button
          className="icon"
          disabled={!s.matches.length}
          onClick={() => s.onPick(s.index - 1)}
          title={t("search.prev")}
        >
          <Icon name="arrowUp" />
        </button>
        <button
          className="icon"
          disabled={!s.matches.length}
          onClick={() => s.onPick(s.index + 1)}
          title={t("search.next")}
        >
          <Icon name="arrowDown" />
        </button>
        <button className="icon" onClick={s.onClose} title={t("common.closeEsc")}>
          <Icon name="close" />
        </button>
      </div>
      <div className="search-row tools">
        <Segmented
          label={t("search.mode")}
          options={MODES.map((m) => ({ value: m, label: t(`search.mode.${m}`) }))}
          value={s.mode}
          onChange={s.onMode}
        />
        {REGEX.includes(s.mode) && (
          <label className="check" title={t("search.regex.title")}>
            <input type="checkbox" checked={s.regex} onChange={(e) => s.onRegex(e.target.checked)} />
            {t("search.regex")}
          </label>
        )}
        {!history && s.query.trim() && (
          <button className="ghost" onClick={s.onFindAll}>
            {t("search.all")}
          </button>
        )}
      </div>
      {history && s.result && s.result.hits.length > 0 && (
        <ul className="search-results" ref={list} aria-label={t("search.results")}>
          {s.result.hits.map((h, i) => (
            <li key={h.id}>
              <button
                className={i === s.index ? "on" : ""}
                onClick={() => s.onPick(i)}
                title={s.isLoaded(h.id) ? undefined : t("search.unloaded")}
              >
                <code>{h.id.slice(0, 7)}</code>
                <span className="summary">{h.summary || t("common.noMessage")}</span>
                <span className="meta">
                  {h.author} · {fmtTime(h.time)}
                  {!s.isLoaded(h.id) && <Icon name="history" className="far" />}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {history && s.result && (s.result.timedOut || s.result.more) && (
        <p className="note">{t(s.result.timedOut ? "search.timedOut" : "search.more", { n: s.result.hits.length })}</p>
      )}
    </div>
  );
}
