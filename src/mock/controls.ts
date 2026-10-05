// The demo's switches for development and e2e (`window.__ddugitDemo`), the flags a page sets before it loads, and the demo license.

import type {
  FileDiff,
  LicenseInfo,
  LicenseStatus,
  NewReport,
  ProStatus,
  RefInfo,
  RepoSnapshot,
  UpdateInfo,
} from "../types";
import { repo } from "./repo";

/** Bumped by cancelling, so a pending demo sign-in ends as "Cancelled". */
export const demoActivation = { n: 0 };
export const demoLicense = { current: null as LicenseInfo | null };
/** The demo license as `license_status` reports it (demo licenses never lapse or sit on another computer). */
export const demoLicenseStatus = (): LicenseStatus => ({
  license: demoLicense.current,
  newerThanLicense: false,
  checkable: true,
  expired: false,
  otherDevice: false,
});
/** Put `license` on the demo computer (null removes it) and follow it with Pro. */
export function putDemoLicense(license: LicenseInfo | null) {
  demoLicense.current = license;
  demoControls.pro = license
    ? { pro: true, source: license.kind === "site" ? "site" : "license" }
    : { pro: false, source: "free" };
  return demoLicenseStatus();
}
/** What ddugit.com signs for a purchase activated on the demo computer. */
export const DEMO_LIFETIME: LicenseInfo = {
  id: "lic_demo_life",
  name: "Demo User",
  email: "me@demo.example",
  kind: "personal",
  seats: 1,
  issued: "2026-10-05",
  updatesUntil: "9999-12-31",
  plan: "lifetime",
  device: "5f0c…demo",
};
/**
 * What a page can set before the demo loads (e2e), each as `window.__ddugitDemo<Name>`
 * (e.g. `__ddugitDemoPro`); e2e's `demoFlags` sets them.
 */
export interface DemoFlags {
  /** Free or Pro (Pro by default, so every feature shows). */
  Pro: ProStatus;
  /** A newer version announced at startup (the update notice). */
  Update: UpdateInfo;
  /** git can't be found (the first-run notice). */
  GitMissing: boolean;
  /** A license on the demo computer from the start. */
  License: { kind: "lifetime" | "site"; deviceRemoved?: boolean };
  /** Remember the open tabs across reloads, like the desktop app (the demo otherwise starts on its repository). */
  Tabs: boolean;
}

const flag = <K extends keyof DemoFlags>(name: K): DemoFlags[K] | undefined =>
  typeof window === "undefined"
    ? undefined
    : ((window as unknown as Record<string, unknown>)[`__ddugitDemo${name}`] as DemoFlags[K] | undefined);

/** Dev/e2e hooks, exposed as `window.__ddugitDemo`. */
export const demoControls = {
  /** Make the next remote call fail authentication. */
  failNextRemote: null as null | "https" | "ssh",
  /** Local branches the demo reports as deleted on the remote. */
  goneBranches: [] as string[],
  /** Folder the next "choose folder" dialog returns (default: the demo repository). */
  nextFolder: null as string | null,
  /** Make the next merge, cherry-pick or revert stop on a conflict in two files. */
  conflictNext: false,
  /** Make the next backport stop on a commit whose change is already there (nothing to commit). */
  emptyNext: false,
  /** How the next checked bundle (transfer import) turns out: a bad checksum, prerequisites missing here, or no `.sha256`. */
  nextBundle: null as null | "mismatch" | "missing" | "absent",
  /** How the demo's GitHub token is found: logged-in `gh`, a saved one, none, or refused. */
  forgeToken: "cli" as "cli" | "keychain" | "none" | "unauthorized",
  /** Free or Pro in the demo (Pro by default, so every feature shows); the `Pro` flag starts it otherwise. */
  pro: flag("Pro") ?? ({ pro: true, source: "license" } as ProStatus),
  /** ddugit.com has this device removed from the license: the next check drops it. */
  deviceRemoved: false,
  /** ddugit.com can't be reached when removing this device. */
  offline: false,
  /** Install a demo license (e2e): a lifetime license on this device, or a site license. */
  setLicense(kind: "lifetime" | "site" | null) {
    putDemoLicense(
      kind === "lifetime"
        ? { ...DEMO_LIFETIME }
        : kind === "site"
          ? {
              id: "lic_demo",
              name: "Demo Corp",
              email: "it@demo.example",
              kind: "site",
              seats: 50,
              issued: "2026-10-02",
              updatesUntil: "2027-10-02",
            }
          : null,
    );
  },
  /** A newer version the demo announces (the update notice); the `Update` flag shows one at startup. */
  update: flag("Update") ?? (null as UpdateInfo | null),
  /** git can't be found (the first-run notice); the `GitMissing` flag starts that way. */
  gitMissing: !!flag("GitMissing"),
  /** The open tabs are remembered across reloads (the `Tabs` flag). */
  keepTabs: !!flag("Tabs"),
  /** The demo tab throws while rendering (the tab's error boundary, e2e) until this is cleared. */
  crashTab: false,
  /** Extra milliseconds every demo remote operation takes (e2e: something still running). */
  slow: 0,
  /** Make the next checkout fail with this text, like an unexpected backend error (the toast's Report button). */
  failNext: null as string | null,
  /** How the next problem reports fail: the site's rate limit, or no network. */
  reportFail: null as null | "limited" | "offline",
  /** Problem reports and questions sent from the demo (e2e reads them). */
  sent: [] as NewReport[],
  /** Current demo state, read synchronously (e2e assertions). */
  snapshot: () => repo.snapshot(),
  /** Append `n` commits to the current branch (long straight runs for the graph). */
  grow(n: number) {
    for (let i = 0; i < n; i++) repo.add(repo.head, `Step ${i + 1} of ${n}`);
  },
  /** Swap in another history, e.g. a big repository's snapshot (performance checks, docs/PERF.md). */
  loadHistory(snap: Pick<RepoSnapshot, "commits" | "refs" | "head">) {
    repo.commits = new Map(snap.commits.map((c) => [c.id, c]));
    repo.order = snap.commits.map((c) => c.id);
    const of = (kind: RefInfo["kind"]) =>
      new Map(snap.refs.filter((r) => r.kind === kind).map((r) => [r.name, r.target] as const));
    repo.branches = of("local");
    repo.remotes = of("remote");
    repo.tags = of("tag");
    repo.stashes = [];
    if (snap.head.branch) repo.head = snap.head.branch;
  },
  /** Files every commit diff returns instead of the made-up ones (performance checks). */
  diffs: null as FileDiff[] | null,
  /** A new commit on `branch` (e.g. the bottom of a stack moving on). */
  commitOn(branch: string, summary: string) {
    repo.add(branch, summary);
  },
};
export type DemoControls = typeof demoControls;

const initialLicense = flag("License");
if (initialLicense) {
  demoControls.setLicense(initialLicense.kind);
  demoControls.deviceRemoved = !!initialLicense.deviceRemoved;
}
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__ddugitDemo = demoControls;
}
/** What Pro-only commands answer without Pro (`pro::LOCKED`). */
export const PRO_LOCKED = "This is a ddugit Pro feature";
