// User settings kept in localStorage. Parsing is pure (and tested) so a
// corrupt or older stored value falls back to defaults instead of breaking.

export interface Settings {
  /** Sparkles flowing along edges and node birth bursts. */
  animate: boolean;
  /** Commits loaded at once (and per "load more"). */
  historyPage: number;
  /** git executable; empty means `git` on PATH. */
  gitPath: string;
}

export const HISTORY_PAGES = [1000, 3000, 10000] as const;

export function defaults(reducedMotion = false): Settings {
  return { animate: !reducedMotion, historyPage: 3000, gitPath: "" };
}

/** Stored JSON → settings, keeping only well-formed fields. */
export function parseSettings(raw: string | null, base: Settings): Settings {
  let v: unknown;
  try {
    v = raw ? JSON.parse(raw) : null;
  } catch {
    return base;
  }
  if (!v || typeof v !== "object") return base;
  const o = v as Record<string, unknown>;
  return {
    animate: typeof o.animate === "boolean" ? o.animate : base.animate,
    historyPage:
      typeof o.historyPage === "number" && (HISTORY_PAGES as readonly number[]).includes(o.historyPage)
        ? o.historyPage
        : base.historyPage,
    gitPath: typeof o.gitPath === "string" ? o.gitPath : base.gitPath,
  };
}

export interface Shortcut {
  keys: string;
  what: string;
}

/** Shown in the settings screen; keep in sync with the handlers. */
export const SHORTCUTS: { group: string; items: Shortcut[] }[] = [
  {
    group: "그래프",
    items: [
      { keys: "휠", what: "시간축을 따라 이동" },
      { keys: "⌘/Ctrl + 휠, 핀치", what: "커서 기준 확대·축소" },
      { keys: "Shift + 휠", what: "위아래로 이동" },
      { keys: "+ / -", what: "확대 / 축소" },
      { keys: "0", what: "전체 보기" },
      { keys: "H", what: "HEAD로" },
      { keys: "점 끌어 브랜치 끝에 놓기", what: "병합" },
      { keys: "⌥/Alt + 끌기", what: "cherry-pick" },
      { keys: "우클릭", what: "커밋·브랜치 메뉴" },
      { keys: "Esc", what: "선택 해제" },
    ],
  },
  {
    group: "검색",
    items: [
      { keys: "⌘/Ctrl + F", what: "커밋 검색" },
      { keys: "Enter / Shift + Enter", what: "다음 / 이전 결과" },
    ],
  },
  {
    group: "커밋과 변경",
    items: [
      { keys: "⌘/Ctrl + Enter", what: "커밋 (작성 중일 때)" },
      { keys: "[ / ]", what: "diff에서 이전 / 다음 파일" },
      { keys: "줄 번호 클릭, Shift + 클릭", what: "줄 단위로 고르기 (스테이징)" },
    ],
  },
  { group: "앱", items: [{ keys: "?", what: "설정과 단축키" }] },
];
