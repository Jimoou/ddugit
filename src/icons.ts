// ddugit's own icon set: 24×24 stroke paths, shared by the DOM (`components/Icon.tsx`)
// and the graph canvas (`Path2D`), so a glyph looks the same everywhere and on every OS.

export const ICONS = {
  close: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  chevronDown: "M6 9l6 6 6-6",
  chevronUp: "M6 15l6-6 6 6",
  chevronRight: "M9 6l6 6-6 6",
  arrowLeft: "M19 12H5M11 6l-6 6 6 6",
  arrowRight: "M5 12h14M13 6l6 6-6 6",
  arrowUp: "M12 19V5M6 11l6-6 6 6",
  arrowDown: "M12 5v14M6 13l6 6 6-6",
  fetch: "M7 16.5h-.5A4 4 0 0 1 6.2 9.1 6 6 0 0 1 17.6 9.5a3.6 3.6 0 0 1 1.4 6.9M12 11v10M9 18l3 3 3-3",
  refresh: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v5h5M12 7v5l3 2",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  sparkle: "M12 3c.6 4.2 2.8 6.4 9 9-6.2 2.6-8.4 4.8-9 9-.6-4.2-2.8-6.4-9-9 6.2-2.6 8.4-4.8 9-9z",
  sparkles:
    "M10 3c.5 3.6 2.4 5.5 7 7-4.6 1.5-6.5 3.4-7 7-.5-3.6-2.4-5.5-7-7 4.6-1.5 6.5-3.4 7-7zM18.5 14c.2 1.6 1 2.4 2.5 3-1.5.6-2.3 1.4-2.5 3-.2-1.6-1-2.4-2.5-3 1.5-.6 2.3-1.4 2.5-3z",
  settings:
    "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1",
  square: "M4.5 4.5h15v15h-15z",
  restore: "M7.5 7.5h12v12h-12zM4.5 16.5v-12h12",
  orbit:
    "M12 7a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM6.6 9.6C3.6 10.4 1.9 11.5 2.3 12.6c.6 1.8 5.4 2.1 10.6.7s8.9-4 8.4-5.8c-.3-1-2-1.4-4.6-1.2",
  telescope: "M3 13.5l11-5.5 2.2 4.4-11 5.5zM14 8l4.5-2.2 2.2 4.4-4.5 2.2M10 16.5L8 22M11 16l3 6",
  head: "M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12zM12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z",
  cloud: "M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6.2 9.6 4.2 4.2 0 0 0 7 18z",
  tag: "M12 3.5l8.5 8.5-8.5 8.5L3.5 12z",
  pull: "M4 8h14M14 4l4 4-4 4M20 16H6M10 12l-4 4 4 4",
  star: "M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z",
  check: "M5 12.5l4.5 4.5L19 7",
  copy: "M9 9h11v11H9zM5 15H4V4h11v1",
  folder: "M3 6.5h6l2 2.5h10v10.5H3z",
  clone: "M12 3v12M7 10l5 5 5-5M4 20h16",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
  enter: "M20 5v7a3 3 0 0 1-3 3H5M9 11l-4 4 4 4",
  edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
  key: "M8 15a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 11h9M18 11v3M21 11v2",
  external: "M14 4h6v6M20 4l-9 9M18 14v6H4V6h6",
  fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  rotate: "M4 11h9v9H4zM8 4h3a7 7 0 0 1 7 7v1.5M15 10l3 3 3-3",
  sidebar: "M4 5h16v14H4zM9 5v14",
  branch: "M6 3v12M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM18 9c0 5-12 3-12 6",
  stash: "M4 8h16M6 8v11h12V8M8 4h8l2 4H6z",
  cherry:
    "M8 14a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM17 12a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM8 14c1-5 4-8 9-10M17 12c-.5-3-1.5-5.5-3.5-7.5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  /** A sealed package: a transfer bundle for an air-gapped network. */
  bundle: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5zM3 7.5 12 12l9-4.5M12 12v9",
  stack: "M12 3 3 7.5l9 4.5 9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5",
  backport: "M6 3v18M18 3v8a4 4 0 0 1-4 4H6M10 11l-4 4 4 4",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  unlock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 6.9-.8",
  /** Rows of text: the graph turned upright, read like a list. */
  list: "M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01",
  /** A folded map: the overview strip (minimap). */
  map: "M3 6.5l6-2.5 6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5zM9 4v13.5M15 6.5V20",
  /** Brand marks, unaltered (filled, no stroke): GitHub's Invertocat and GitLab's tanuki. */
  github:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  gitlab:
    "m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z",
} as const;

export type IconName = keyof typeof ICONS;

/** Icons drawn filled rather than outlined. */
export const FILLED: ReadonlySet<IconName> = new Set(["sparkle", "sparkles", "github", "gitlab"]);
/** Marks drawn exactly as given: filled, with no outline to thicken them. */
export const BRAND: ReadonlySet<IconName> = new Set(["github", "gitlab"]);

const paths = new Map<IconName, Path2D>();
/** A cached `Path2D` of an icon, for drawing on the canvas (24×24 units). */
export function iconPath(name: IconName): Path2D {
  let p = paths.get(name);
  if (!p) {
    p = new Path2D(ICONS[name]);
    paths.set(name, p);
  }
  return p;
}
