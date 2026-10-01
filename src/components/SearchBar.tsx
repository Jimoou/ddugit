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
        placeholder="메시지 · 작성자 · SHA · 브랜치"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onStep(e.shiftKey ? -1 : 1);
          if (e.key === "Escape") onClose();
        }}
      />
      <span className="count">{query.trim() ? (count ? `${index + 1} / ${count}` : "없음") : ""}</span>
      <button className="icon" disabled={!count} onClick={() => onStep(-1)} title="이전 (Shift+Enter)">
        ↑
      </button>
      <button className="icon" disabled={!count} onClick={() => onStep(1)} title="다음 (Enter)">
        ↓
      </button>
      <button className="icon" onClick={onClose} title="닫기 (Esc)">
        ✕
      </button>
    </div>
  );
}
