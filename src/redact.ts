// Strip what a problem report must not carry: paths (folder and file names),
// URLs (hosts, and tokens in their userinfo), email addresses and access
// tokens. Commit ids and plain words stay, so the text still says what failed.

/** Each rule replaces its matches with a placeholder; order matters (URLs before emails before paths). */
const RULES: [RegExp, string][] = [
  // scheme://… (https, ssh, file, git): host, userinfo and path all go.
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "<url>"],
  // scp-like remotes: git@host:org/repo.git
  [/\b[\w.-]+@[\w.-]+:[^\s"'<>]+/g, "<url>"],
  [/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, "<email>"],
  // Forge tokens by their prefixes, and a value after "Bearer" / "token" (not a word like "token expired").
  [/\b(?:gh[pousr]_|github_pat_|glpat-|glptt-|gldt-)[\w-]+/g, "<token>"],
  [/\b(Bearer|token)\s+(?=[\w.~+/-]*\d)[\w.~+/-]{8,}=*/gi, "$1 <token>"],
  // Quoted text with a separator in it is a path (keeps spaces inside together).
  [/'[^'\n]*[/\\][^'\n]*'/g, "'<path>'"],
  [/"[^"\n]*[/\\][^"\n]*"/g, '"<path>"'],
  // Windows drive and UNC paths.
  [/\b[a-z]:[\\/][^\s"'<>|:]*/gi, "<path>"],
  [/\\\\[^\s"'<>|]+/g, "<path>"],
  // Home-relative and absolute Unix paths.
  [/~[/\\][^\s"'<>]*/g, "<path>"],
  [/(?<![\w>])\/[^\s"'<>:;,)]+/g, "<path>"],
  // Relative paths and ref names with a separator (src/app.ts, feature/login).
  [/\b[\w.-]+(?:[\\/][\w.-]+)+/g, "<path>"],
  // Long opaque secrets (keys, unknown token formats). Hex ids (commits) stay.
  [/\b(?![0-9a-f]+\b)[A-Za-z0-9_-]{32,}\b/g, "<token>"],
];

/** `text` with paths, URLs, emails and tokens replaced by `<path>`, `<url>`, `<email>`, `<token>`. */
export function redact(text: string): string {
  return RULES.reduce((s, [re, to]) => s.replace(re, to), text);
}
