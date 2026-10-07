// `.gitignore` patterns offered for a changed file: the file itself, its extension, its folder.

/** What a file's menu can add to the top-level `.gitignore`. */
export interface IgnoreChoices {
  /** Just this file, anchored at the top: `/src/debug.log`. */
  file: string;
  /** Every file with its extension, anywhere: `*.log` (none without one, or for a dotfile like `.env`). */
  ext: { ext: string; pattern: string } | null;
  /** Its folder, anchored: `/src/` (none for a file at the top). */
  dir: { dir: string; pattern: string } | null;
}

/**
 * A literal piece of a path as gitignore text: glob characters and backslashes are escaped, and
 * so are trailing spaces (git drops them otherwise). A leading `#` or `!` never reaches the start
 * of a pattern here: every pattern built from a path starts with `/` or `*.`.
 */
export function escapeIgnore(s: string): string {
  return s.replace(/[\\*?[\]]/g, "\\$&").replace(/ +$/, (spaces) => spaces.replace(/ /g, "\\ "));
}

/** The patterns for `path` (repository-relative, `/`-separated; a trailing `/` names a folder). */
export function ignoreChoices(path: string): IgnoreChoices {
  const isDir = path.endsWith("/");
  const clean = path.replace(/\/+$/, "");
  const slash = clean.lastIndexOf("/");
  const name = clean.slice(slash + 1);
  const dir = slash > 0 ? clean.slice(0, slash) : null;
  const dot = name.lastIndexOf(".");
  const ext = !isDir && dot > 0 && dot < name.length - 1 ? name.slice(dot + 1) : null;
  return {
    file: `/${escapeIgnore(clean)}${isDir ? "/" : ""}`,
    ext: ext ? { ext, pattern: `*.${escapeIgnore(ext)}` } : null,
    dir: dir ? { dir, pattern: `/${escapeIgnore(dir)}/` } : null,
  };
}
