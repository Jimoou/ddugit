/** A bundle written by ddugit is named <repo>-<destination>-<YYYY-MM-DD-HHMMSS>.bundle: guess the destination. */
export function guessName(file: string, repoPath: string): string {
  const base = (s: string) => s.split(/[\\/]/).filter(Boolean).pop() ?? "";
  const repo = base(repoPath).replace(/[^\p{L}\p{N}_-]+/gu, "-");
  let n = base(file)
    .replace(/\.bundle$/, "")
    .replace(/-\d{4}-\d{2}-\d{2}-\d{6}$/, "");
  if (repo && n.startsWith(`${repo}-`)) n = n.slice(repo.length + 1);
  return n || "bundle";
}
