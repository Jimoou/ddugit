// Strip what a problem report must not carry: paths and file names, ref names,
// hosts, URLs (and tokens in their userinfo), user names, email addresses and
// access tokens. Commit ids, versions, times, git's own words and error codes
// stay, so the text still says what failed.

type Replace = string | ((match: string, ...groups: string[]) => string);

/** Public forge hosts say nothing about the user's work; keeping them helps tell an ssh or auth failure apart. */
const PUBLIC_HOST = /^(?:github\.com|gitlab\.com|bitbucket\.org|ddugit\.com)$/i;

/** Quoted words that are git's own (refs every repository has, commands it suggests), not the user's. */
const GIT_WORD = /^(?:HEAD|FETCH_HEAD|ORIG_HEAD|MERGE_HEAD|origin|upstream|main|master|git(?: [^'"\n]*)?|<\w+>)$/;

/** Slash words in git's messages that aren't paths: conflict kinds and protocol names. */
const SLASH_WORD =
  /^(?:(?:add|modify|delete|rename|file|directory)\/(?:add|modify|delete|rename|file|directory)|HTTP\/[\d.]+)$/i;

/** Dotted words that are git's (config keys, lock files, ssh key names), not a file or host of the user's. */
const DOTTED_KEEP =
  /^(?:(?:core|user|commit|gpg|pull|push|fetch|remote|branch|merge|rebase|diff|http|credential|init|lfs|filter|submodule|safe|tag|sequence|color|url|alias)\.[\w.-]+|(?:index|config|HEAD|packed-refs|shallow)\.lock|id_\w+\.pub)$/;

/** A quoted span becomes `'<path>'` or `'<name>'`, unless it's git's own word or already a placeholder. */
const quoted = (q: string) => (m: string, inner: string) =>
  GIT_WORD.test(inner) || DOTTED_KEEP.test(inner) || PUBLIC_HOST.test(inner)
    ? m
    : `${q}<${/[\\/]/.test(inner) ? "path" : "name"}>${q}`;

/** Each rule replaces its matches with a placeholder; order matters (URLs and emails before names and paths). */
const RULES: [RegExp, Replace][] = [
  // scheme://… (https, ssh, file, git): host, userinfo and path all go.
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, "<url>"],
  // scp-like remotes: git@host:org/repo.git
  [/\b[\w.-]+@[\w.-]+:[^\s"'<>]+/g, "<url>"],
  // Tokens by their prefixes (forges, AWS, Slack), and a value after "Bearer" / "token" (not "token expired").
  [/\b(?:gh[pousr]_|github_pat_|glpat-|glptt-|gldt-|xox[abposr]-)[\w-]+/g, "<token>"],
  [/\b(?:AKIA|ASIA)[A-Z0-9]{12,}\b/g, "<token>"],
  [/\b(Bearer|token)\s+(?=[\w.~+/-]*\d)[\w.~+/-]{8,}=*/gi, "$1 <token>"],
  // user@host, with or without a dotted domain (git's guess "jdoe@LAPTOP.(none)" too). git@<public forge> stays.
  [
    /\b[\w.+-]+@[\w-]+(?:\.(?:[\w-]+|\([\w-]+\)))*/g,
    (m) => (/^git@/.test(m) && PUBLIC_HOST.test(m.slice(4)) ? m : "<email>"),
  ],
  // Tab-indented lines are git's file lists ("would be overwritten", status); a "modified:" label stays.
  [/^(\t+(?:[a-z ]+:[ \t]+)?)\S.*$/gm, "$1<path>"],
  // Ref names in git's sentences: push and fetch lines, and the unquoted shapes.
  [/(^|[ \t])\S+ -> \S+/gm, "$1<ref> -> <ref>"],
  [
    /\b(Deleted (?:remote-tracking )?branch|On branch|src refspec|remote ref|invalid reference:|not a valid object name:?) +(?!['"<])[^\s'"]+/gi,
    "$1 <ref>",
  ],
  // The user name in auth failures, and hosts by what git and ssh call them.
  [/\b(for user|denied to) +[^\s'"<]+?(?=\.?(?:\s|$))/gi, "$1 <user>"],
  [
    /\b(host(?:name)?:?[ \t]+)(?!key\b)(?!['"<])([^\s:,'"]+)/gi,
    (m, word: string, host: string) => (PUBLIC_HOST.test(host) ? m : `${word}<host>`),
  ],
  // Conflicted files: the rest of the line is a path (spaces and all).
  [/\b((?:CONFLICT \([\w/]+\): )?Merge conflict in |CONFLICT \([\w/]+\): )(?!\d+ files?\b).+$/gm, "$1<path>"],
  // Anything quoted is the user's (refs, paths, remote names, "Name <email>"), unless it's git's own word.
  [/(?<!\w)'([^'\n]+)'(?!\w)/g, quoted("'")],
  [/(?<!\w)"([^"\n]+)"(?!\w)/g, quoted('"')],
  // Windows drive and UNC paths.
  [/\b[a-z]:[\\/][^\s"'<>|:]*/gi, "<path>"],
  [/\\\\[^\s"'<>|]+/g, "<path>"],
  // Home-relative and absolute Unix paths.
  [/~[/\\][^\s"'<>]*/g, "<path>"],
  [/(?<![\w>])\/[^\s"'<>:;,)]+/g, "<path>"],
  // Relative paths and ref names with a separator (src/app.ts, feature/login).
  [/\b[\w.-]+(?:[\\/][\w.-]+)+/g, (m) => (SLASH_WORD.test(m) ? m : "<path>")],
  // Bare file and host names (Payroll.xlsx, git.acme.corp, .env.local): the last part starts with a letter, so
  // versions (2.47.0, 2.47.0.windows.1) stay, and a one-letter first part doesn't count ("e.g."). A name right before " (" is a function in a stack frame.
  [
    /(?<![\w.<>-])(?:\.[\w-]+|[\w-]{2,})(?:\.[\w-]+)*\.[A-Za-z][\w-]*(?![\w-]|\.\w)( \()?/g,
    (m, call?: string) => (call || DOTTED_KEEP.test(m) || PUBLIC_HOST.test(m) ? m : "<name>"),
  ],
  // IPv4 addresses.
  [/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w]|\.\d)/g, "<host>"],
  // Long opaque secrets (keys, unknown token formats). Hex ids (commits) stay.
  [/\b(?![0-9a-f]+\b)[A-Za-z0-9_-]{32,}\b/g, "<token>"],
];

/** `text` with the user's names and secrets replaced by `<path>`, `<name>`, `<ref>`, `<host>`, `<url>`, `<email>`… */
export function redact(text: string): string {
  return RULES.reduce((s, [re, to]) => (typeof to === "string" ? s.replace(re, to) : s.replace(re, to)), text);
}
