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
} as const;

export type IconName = keyof typeof ICONS;

/** Icons drawn filled rather than outlined. */
export const FILLED: ReadonlySet<IconName> = new Set(["sparkle", "sparkles"]);

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
