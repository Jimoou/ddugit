import { t } from "../i18n";

interface Props {
  query: string;
  /** Number of matches and the 0-based index of the current one. */
  count: number;
  index: number;
  onQuery(q: string): void;
  onStep(dir: 1 | -1): void;
  onClose(): void;
}

/** Floating search over the graph (⌘/Ctrl+F). Enter / Shift+Enter walk the matches. */
export function SearchBar({ query, count, index, onQuery, onStep, onClose }: Props) {
  return (
    <div className="search-bar" role="search">
      <span className="ico">⌕</span>
      <input
        autoFocus
        placeholder={t("search.placeholder")}
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onStep(e.shiftKey ? -1 : 1);
          if (e.key === "Escape") onClose();
        }}
      />
      <span className="count">{query.trim() ? (count ? `${index + 1} / ${count}` : t("common.none")) : ""}</span>
      <button className="icon" disabled={!count} onClick={() => onStep(-1)} title={t("search.prev")}>
        ↑
      </button>
      <button className="icon" disabled={!count} onClick={() => onStep(1)} title={t("search.next")}>
        ↓
      </button>
      <button className="icon" onClick={onClose} title={t("common.closeEsc")}>
        ✕
      </button>
    </div>
  );
}
