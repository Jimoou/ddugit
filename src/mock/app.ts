// Demo commands around repositories rather than in one: opening, cloning, the dashboard, settings, license, updates and reports.

import type { RepoGlance } from "../types";
import { version as appVersion } from "../../package.json";
import {
  DEMO_LIFETIME,
  PRO_LOCKED,
  demoActivation,
  demoControls,
  demoLicense,
  demoLicenseStatus,
  putDemoLicense,
} from "./controls";
import { AUTH_OUTPUT, PHASES } from "./remote";
import { AUTHORS, type Table, delay, fail, res } from "./repo";

const GLANCE_BRANCHES = ["main", "develop", "feature/orbit", "release/2.1"];
const GLANCE_SUMMARIES = ["Tune lane spacing", "Fix login redirect", "Bump dependencies", "Add export dialog"];

/**
 * Every folder "is" the demo repository, but a dashboard of identical worlds
 * shows nothing; each path gets its own steady, made-up state instead. Paths
 * named like a missing folder (`gone`) can't be read.
 */
/** What batch work changed in the dashboard's demo repositories (branch switched, pulled). */
export const demoWorlds = new Map<string, Partial<RepoGlance>>();

export function demoGlance(path: string): RepoGlance {
  return { ...demoGlanceBase(path), ...demoWorlds.get(path) };
}

function demoGlanceBase(path: string): RepoGlance {
  let h = 2166136261;
  for (const ch of path) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const pick = (shift: number, n: number) => (h >>> shift) % n;
  const empty = { branch: null, upstream: null, ahead: 0, behind: 0, changes: 0, conflicts: 0, stashes: 0 };
  if (/gone/.test(path))
    return {
      path,
      error: `could not find repository at '${path}'`,
      ...empty,
      state: "clean",
      remotes: 0,
      origin: null,
      last: null,
    };
  const branch = GLANCE_BRANCHES[pick(0, 4)];
  const stopped = pick(20, 7) === 0;
  return {
    path,
    error: null,
    branch,
    upstream: `origin/${branch}`,
    ahead: pick(3, 3),
    behind: pick(6, 4),
    changes: stopped ? 2 : pick(9, 3) === 0 ? 0 : pick(11, 6),
    conflicts: stopped ? 1 : 0,
    state: stopped ? "merge" : "clean",
    stashes: pick(14, 3) === 0 ? 1 : 0,
    remotes: 1,
    // Owner from the folder name's first word (`acme-main` → acme), so the demo has something to suggest.
    origin: `https://github.com/${(path.split("/").pop() ?? "").split("-")[0]}/${path.split("/").pop()}.git`,
    last: {
      summary: GLANCE_SUMMARIES[pick(16, 4)],
      author: AUTHORS[pick(18, 4)],
      time: Math.floor(Date.now() / 1000) - 600 - pick(22, 200) * 1800,
    },
  };
}

export const appCommands = {
  initial_repo: () => delay(null, 0),
  // Any folder "is" the demo repository, except ones named like a plain folder.
  repo_root: ({ dir }) => delay(/not-a-repo/.test(dir) ? null : dir, 0),
  async git_clone({ url, onProgress }) {
    if (demoControls.slow) await delay(null, demoControls.slow);
    const fake = demoControls.failNextRemote;
    if (fake) {
      demoControls.failNextRemote = null;
      await delay(null, 200);
      return res("auth", AUTH_OUTPUT[fake]);
    }
    if (!url.trim()) return fail("Enter a repository URL");
    for (const phase of PHASES.fetch)
      for (let pct = 0; pct <= 100; pct += 25) {
        onProgress.onmessage({ phase, percent: pct });
        await delay(null, 40);
      }
    return res("ok", `Cloning into '${url}'...`);
  },
  git_init: () => delay(res("ok", "Initialized empty Git repository")),
  repo_glance: ({ paths }) => delay(paths.map(demoGlance)),

  set_git_path({ gitPath }) {
    // Nothing runs in the demo; accept anything that looks like a git binary.
    if (gitPath && !/git(\.exe)?$/i.test(gitPath)) return fail(`'${gitPath}' is not a git executable`);
    return delay("git version 2.47.0 (demo)");
  },
  open_in({ file, how }) {
    // Nothing leaves the demo: note what would have opened (e2e reads `opened`).
    if (file?.split("/").includes("..") || file?.split("/").includes(".git"))
      return fail(`'${file}' is not a path inside the repository`);
    demoControls.opened.push({ what: how.kind, file, with: how.kind === "editor" ? how.program : undefined });
    return delay(null);
  },
  open_version({ rev, file, editor }) {
    demoControls.opened.push({ what: "version", file: `${file}@${rev.slice(0, 7)}`, with: editor ?? undefined });
    return delay(null);
  },
  check_editor({ program }) {
    // Like `open::editor`: a known name, or a full path that isn't a shell.
    const known = ["code", "cursor", "subl", "idea", "zed"];
    const name = program.split(/[\\/]/).pop()?.toLowerCase() ?? "";
    if (/^(sh|bash|zsh|python\d*|node|cmd|powershell)(\.exe)?$/.test(name))
      return fail(`'${program}' runs files instead of editing them`);
    if (known.includes(program)) return delay(`/usr/local/bin/${program}`);
    if (program.startsWith("/") || /^[A-Za-z]:\\/.test(program)) return delay(program);
    return fail(`'${program}' is not an editor ddugit knows (give its full path)`);
  },
  tool_setup: () =>
    delay({
      diff: "meld",
      merge: "meld",
      customDiff: ["vscode"],
      customMerge: ["vscode"],
      known: ["kdiff3", "meld", "opendiff", "p4merge", "tortoisemerge", "winmerge"],
    }),
  git_version() {
    if (demoControls.gitMissing) return fail("Can't run 'git': No such file or directory (os error 2)");
    return delay("git version 2.47.0 (demo)");
  },
  report_send({ report }) {
    demoControls.sent.push(report);
    if (demoControls.reportFail === "limited") return fail("Too many reports. Try again later.");
    if (demoControls.reportFail === "offline")
      return fail("Couldn't reach ddugit.com: io: failed to lookup address information");
    return delay(`demo-${demoControls.sent.length}`);
  },
  app_info: () => delay({ version: `${appVersion}-demo`, os: "demo", osVersion: navigator.platform, arch: "web" }),

  license_status: () => Promise.resolve(demoLicenseStatus()),
  license_install({ text }) {
    if (!text.trim().startsWith("DDUGIT1.")) return Promise.reject("This is not a ddugit license");
    return Promise.resolve(
      putDemoLicense({
        id: "lic_demo",
        name: "Demo Corp",
        email: "it@demo.example",
        kind: "commercial",
        seats: 5,
        issued: "2026-10-02",
        updatesUntil: "2027-10-02",
      }),
    );
  },
  async license_activate() {
    const ticket = ++demoActivation.n;
    await delay(null, 900);
    if (ticket !== demoActivation.n) return Promise.reject("Cancelled");
    return putDemoLicense({ ...DEMO_LIFETIME });
  },
  license_activate_cancel() {
    demoActivation.n++;
    return delay(undefined, 0);
  },
  license_deactivate() {
    return delay({
      status: putDemoLicense(null),
      confirmed: !demoControls.offline,
      error: demoControls.offline ? "Couldn't reach ddugit.com" : null,
    });
  },
  license_refresh() {
    const lic = demoLicense.current;
    if (!lic) return Promise.reject("No license on this computer");
    if (!lic.device || !demoControls.deviceRemoved) return delay("current" as const);
    putDemoLicense(null);
    return delay("removed" as const);
  },
  license_remove: () => Promise.resolve(putDemoLicense(null)),
  update_check: () => delay(demoControls.update),
  update_install() {
    demoControls.update = null;
    return delay(null);
  },
  pro_status: () => delay(demoControls.pro),
  batch_switch({ path, branch }) {
    if (!demoControls.pro.pro) return Promise.reject(PRO_LOCKED);
    const g = demoGlance(path);
    if (g.error) return fail(g.error);
    if (g.state !== "clean") return fail(`Repository is in the middle of a ${g.state}; finish or abort it first`);
    const how = g.branch === branch ? "already" : GLANCE_BRANCHES.includes(branch) ? "tracked" : "created";
    const upstream = how === "created" ? null : `origin/${branch}`;
    demoWorlds.set(path, { ...demoWorlds.get(path), branch, upstream, ahead: 0, behind: 0 });
    return delay({ result: res("ok", `Switched to branch '${branch}'`), how } as const);
  },
  open_url({ url }) {
    // Like `about::openable`: only https links leave the app.
    if (!url.startsWith("https://")) return fail("Only https links can be opened");
    window.open(url, "_blank", "noopener");
    return delay(null);
  },
} satisfies Partial<Table>;
