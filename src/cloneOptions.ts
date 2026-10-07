// The clone dialog's "Advanced" part as typed, and what it means for `git clone`.

import type { Key } from "./i18n";
import type { CloneOptions } from "./types";

export interface CloneDraft {
  branch: string;
  shallow: boolean;
  /** Commits to keep when shallow, as typed. */
  depth: string;
  singleBranch: boolean;
  submodules: boolean;
}

export const CLONE_DRAFT: CloneDraft = {
  branch: "",
  shallow: false,
  depth: "1",
  singleBranch: false,
  submodules: false,
};

/** Characters (and forms) git refuses in a ref name; a leading `-` would read as an option. */
const BAD_REF = /^-|[\s~^:?*[\\]|\.\.|@\{|\/\/|^\/|\/$|\.$|\.lock$/;
const badRef = (name: string) => BAD_REF.test(name) || [...name].some((c) => c < " " || c === "\u007f");

/** The draft as clone options, or the dictionary key saying what is wrong with it. */
export function cloneOptions(d: CloneDraft): { options: CloneOptions } | { error: Key } {
  const branch = d.branch.trim();
  if (branch && badRef(branch)) return { error: "clone.adv.badBranch" };
  let depth: number | null = null;
  if (d.shallow) {
    depth = /^\d{1,7}$/.test(d.depth.trim()) ? Number(d.depth.trim()) : 0;
    if (depth < 1) return { error: "clone.adv.badDepth" };
  }
  return { options: { branch: branch || null, depth, singleBranch: d.singleBranch, submodules: d.submodules } };
}
