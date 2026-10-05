// Identity profiles and signing: the pure part. Profiles live in the user's
// settings (`settings.ts` parses them through `parseProfiles`); the effective
// identity of a repository comes from git (`git/identity.rs`).

import type { Key } from "./i18n";
import type { Identity, Profile, Signing } from "./types";

const FORMATS = ["openpgp", "ssh"] as const;

function parseSigning(v: unknown): Signing | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const format = FORMATS.find((f) => f === o.format);
  return format && typeof o.key === "string" && o.key.trim() ? { format, key: o.key } : null;
}

/** Stored profiles → the well-formed ones (a broken entry is dropped, not the whole list). */
export function parseProfiles(v: unknown): Profile[] | null {
  if (!Array.isArray(v)) return null;
  return v.flatMap((p: unknown) => {
    if (!p || typeof p !== "object") return [];
    const o = p as Record<string, unknown>;
    if (typeof o.name !== "string" || typeof o.email !== "string") return [];
    return [{ name: o.name, email: o.email, signing: parseSigning(o.signing) }];
  });
}

/** Why a profile can't be saved, or null. Mirrors the checks `identity.rs` makes before writing. */
export function profileError(p: Profile): Key | null {
  const lines = /[\r\n\0]/;
  if (!p.name.trim() || lines.test(p.name)) return "identity.err.name";
  if (!/^[^\s<>@]+@[^\s<>@]+$/.test(p.email.trim())) return "identity.err.email";
  if (p.signing && (!p.signing.key.trim() || lines.test(p.signing.key))) return "identity.err.key";
  return null;
}

/** Same person as git would write them (trimmed, email case-insensitive). */
export function sameIdentity(id: Identity | null, p: Profile): boolean {
  return (
    !!id?.name &&
    !!id.email &&
    id.name.value.trim() === p.name.trim() &&
    id.email.value.trim().toLowerCase() === p.email.trim().toLowerCase()
  );
}

/** Same person, and signing as the profile says (on with its key, or off). */
export function matchesProfile(id: Identity | null, p: Profile): boolean {
  if (!sameIdentity(id, p)) return false;
  const signs = !!id?.sign?.value;
  if (!p.signing) return !signs;
  return signs && id?.key?.value === p.signing.key && (id.format?.value ?? "openpgp") === p.signing.format;
}

export interface IdentityView {
  /** `name <email>`, or what is missing. */
  text: string;
  /** Commits would fail: no name or no email anywhere. */
  missing: boolean;
  /** This repository sets its own (any of name / email locally). */
  local: boolean;
  /** Commits will be signed (and with which kind of key). */
  signs: "openpgp" | "ssh" | null;
}

/** What the composer shows about who commits are made as. */
export function viewIdentity(id: Identity): IdentityView {
  const name = id.name?.value.trim() ?? "";
  const email = id.email?.value.trim() ?? "";
  const isLocal = (s: { scope: string } | null) => s?.scope === "local" || s?.scope === "worktree";
  const format = id.format?.value === "ssh" ? "ssh" : "openpgp";
  return {
    text: name && email ? `${name} <${email}>` : name || (email && `<${email}>`),
    missing: !name || !email,
    local: isLocal(id.name) || isLocal(id.email),
    signs: id.sign?.value && id.key?.value ? format : null,
  };
}

/** A profile made from what git has now (the first-use offer); null without a full identity. */
export function profileFrom(id: Identity): Profile | null {
  const name = id.name?.value.trim();
  const email = id.email?.value.trim();
  if (!name || !email) return null;
  const key = id.key?.value.trim();
  const format = id.format?.value === "ssh" ? "ssh" : "openpgp";
  return { name, email, signing: id.sign?.value && key ? { format, key } : null };
}

/** Add `p`, or replace the one at `at`; a second profile with the same name + email replaces the first. */
export function upsertProfile(list: Profile[], p: Profile, at: number | null): Profile[] {
  const clean = { ...p, name: p.name.trim(), email: p.email.trim() };
  const rest = list.filter((x, i) => i !== at && !sameAs(x, clean));
  const index = at === null ? rest.length : Math.min(at, rest.length);
  return [...rest.slice(0, index), clean, ...rest.slice(index)];
}

function sameAs(a: Profile, b: Profile) {
  return a.name === b.name && a.email.toLowerCase() === b.email.toLowerCase();
}

/**
 * A commit that failed while signing: which hint to add. git runs with no
 * terminal, so a key that needs a passphrase can only be unlocked by a GUI
 * pinentry (GPG) or an agent that already holds it (SSH).
 */
export function signingHint(output: string): Key | null {
  if (/gpg failed to sign|gpg: signing failed|no secret key|pinentry|no pinentry/i.test(output))
    return "identity.hint.gpg";
  if (/ssh-keygen|Couldn't (load|sign)|incorrect passphrase|Load key/i.test(output)) return "identity.hint.ssh";
  if (/failed to write commit object/i.test(output)) return "identity.hint.gpg";
  return null;
}
