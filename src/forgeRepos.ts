// Where a repository can be picked from (a URL, or the user's own on a forge),
// and the pure parts of the forge repository picker: search, remote names.

import type { ForgeKind, ForgeRepo } from "./types";

/** A forge the user can list their repositories on; `host` is the public one, editable for self-hosted. */
interface ForgeSource {
  id: ForgeKind;
  kind: ForgeKind;
  host: string;
}

/** Forges to pick from, after "URL". Another forge is one more row (and its backend). */
export const FORGE_SOURCES: readonly ForgeSource[] = [
  { id: "github", kind: "github", host: "github.com" },
  { id: "gitlab", kind: "gitlab", host: "gitlab.com" },
];

export type Source = "url" | ForgeKind;
export const SOURCES: readonly Source[] = ["url", ...FORGE_SOURCES.map((f) => f.id)];

export type Proto = "https" | "ssh";

export const repoUrl = (r: ForgeRepo, proto: Proto) => (proto === "ssh" ? r.sshUrl : r.httpsUrl);

/**
 * Repositories matching every word of `query` (in the name or description).
 * Name matches come first: a word at the start of a path segment, then anywhere
 * in the name, then only in the description; ties keep the forge's order (latest first).
 */
export function filterRepos(repos: readonly ForgeRepo[], query: string): ForgeRepo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [...repos];
  const rank = (r: ForgeRepo) => {
    const name = r.fullName.toLowerCase();
    const text = `${name} ${(r.description ?? "").toLowerCase()}`;
    if (!words.every((w) => text.includes(w))) return -1;
    const segments = name.split("/");
    if (words.every((w) => segments.some((s) => s.startsWith(w)))) return 0;
    return words.every((w) => name.includes(w)) ? 1 : 2;
  };
  return repos
    .map((r, i) => ({ r, i, k: rank(r) }))
    .filter((x) => x.k >= 0)
    .sort((a, b) => a.k - b.k || a.i - b.i)
    .map((x) => x.r);
}

/** A remote name for a picked repository: its owner (top group on GitLab), lowercased, as a valid ref part. */
export function remoteNameFor(fullName: string): string {
  const owner = fullName.split("/")[0] ?? "";
  return (
    owner
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[.-]+|[.-]+$/g, "") || "upstream"
  );
}
