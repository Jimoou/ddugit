// Commands the app shows for the user to copy into a terminal. Paths, URLs and
// hosts in them come from outside (a folder name, a remote URL), so each one is
// quoted for the shell it will be pasted into: nothing in it may expand or run.

/** The shell a copied command is pasted into: PowerShell on Windows, a POSIX shell elsewhere. */
export type Shell = "posix" | "powershell";

export const shellOf = (userAgent: string): Shell => (/Win/i.test(userAgent) ? "powershell" : "posix");

/** Words that mean the same unquoted (no expansion, globbing, splitting or operators in either shell). */
const PLAIN: Record<Shell, RegExp> = {
  posix: /^[\w@+:,./-]+$/,
  powershell: /^[\w+:./\\-]+$/,
};

/** `s` as one literal word: single quotes, which neither shell expands inside. */
export function shellQuote(s: string, shell: Shell): string {
  // PowerShell also takes the typographic single quotes as quotes; doubling escapes each kind.
  if (shell === "powershell") return `'${s.replace(/['\u2018\u2019\u201a\u201b]/g, "$&$&")}'`;
  return `'${s.replaceAll("'", "'\\''")}'`;
}

/** `words` as a command line, quoting only the words that need it (so it still reads plainly). */
export const shellCommand = (words: string[], shell: Shell): string =>
  words.map((w) => (PLAIN[shell].test(w) ? w : shellQuote(w, shell))).join(" ");

/** A host name fit to go into a command as is (letters, digits, dots, hyphens), else null. */
export const safeHost = (host: string): string | null => (/^[a-z0-9][a-z0-9.-]*$/i.test(host) ? host : null);
