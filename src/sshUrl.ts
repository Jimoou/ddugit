// HTTPS ↔ SSH forms of a forge remote address, and where to register an SSH
// key. Pure, so the clone dialog's protocol switch is testable.

/** `git@host:path` or `ssh://…`: an address git reaches over SSH. */
export const isSshUrl = (url: string) => /^(ssh:\/\/|git\+ssh:\/\/|[\w.-]+@[\w.-]+:)/.test(url.trim());

/** `https://host/owner/repo(.git)` → `git@host:owner/repo.git` (other shapes unchanged). */
export function toSsh(url: string): string {
  const m = url.trim().match(/^https?:\/\/(?:[^@/]+@)?([^/:]+)\/(.+?)(?:\.git)?\/?$/i);
  return m ? `git@${m[1]}:${m[2]}.git` : url;
}

/** `git@host:owner/repo(.git)` → `https://host/owner/repo.git` (other shapes unchanged). */
export function toHttps(url: string): string {
  const m = url.trim().match(/^[\w.-]+@([\w.-]+):(?!\/)(.+?)(?:\.git)?$/);
  return m ? `https://${m[1]}/${m[2]}.git` : url;
}

/** The forge page where a public key is added, for the hosts we know. */
export function sshKeysPage(host: string): string | null {
  if (host === "github.com") return "https://github.com/settings/ssh/new";
  if (host === "gitlab.com") return "https://gitlab.com/-/user_settings/ssh_keys";
  return null;
}

/** Host of an SSH address (`git@host:…`, `ssh://user@host:port/…`). */
export function sshHostOf(url: string): string | null {
  const u = url.trim();
  const m = u.match(/^(?:ssh|git\+ssh):\/\/(?:[^@/]+@)?([^/:]+)/i) ?? u.match(/^[\w.-]+@([\w.-]+):/);
  return m ? m[1].toLowerCase() : null;
}
