import { describe, expect, it } from "vitest";
import { redact } from "./redact";

/** A token-shaped string built at run time, so secret scanners don't flag the test source. */
const fake = (prefix: string, n: number) => prefix + "a1B2c3D4e5".repeat(Math.ceil(n / 10)).slice(0, n);

describe("redact", () => {
  it.each([
    ["macOS", "fatal: '/Users/kim/Work/acme-api' is not a git repository", "fatal: '<path>' is not a git repository"],
    ["macOS with spaces, quoted", 'open "/Users/Jane Doe/My Repo/a.txt" failed', 'open "<path>" failed'],
    ["Linux", "cannot lock ref in /home/dev/secret/.git/refs", "cannot lock ref in <path>"],
    ["Windows", "error: C:\\Users\\kim\\repos\\acme\\file.txt: Permission denied", "error: <path>: Permission denied"],
    ["Windows forward slashes", "at C:/Users/kim/acme", "at <path>"],
    ["UNC", "share \\\\fileserver\\team\\repo missing", "share <path> missing"],
    ["home", "key ~/.ssh/id_ed25519 not found", "key <path> not found"],
    ["relative", "pathspec src/secret/plan.md did not match", "pathspec <path> did not match"],
    ["ref name", "branch feature/acme-login already exists", "branch <path> already exists"],
  ])("paths: %s", (_, input, out) => {
    expect(redact(input)).toBe(out);
  });

  it("URLs, with or without credentials in them", () => {
    expect(redact("fatal: unable to access 'https://git.acme.corp/team/api.git/': 403")).toBe(
      "fatal: unable to access '<url>': 403",
    );
    expect(redact(`remote https://kim:${fake("ghp_", 20)}@github.com/acme/api.git`)).toBe("remote <url>");
    expect(redact(`https://oauth2:${fake("glpat-", 12)}@gitlab.com/a/b`)).toBe("<url>");
    expect(redact("ssh://git@git.acme.corp:2222/x.git refused")).toBe("<url> refused");
    expect(redact("git@github.com:acme/private.git: Permission denied")).toBe("<url> Permission denied");
  });

  it("emails", () => {
    expect(redact("Author: Kim <kim.dev+git@acme-corp.co.kr>")).toBe("Author: Kim <<email>>");
    expect(redact("signed by (kim@acme.corp)")).toBe("signed by (<email>)");
  });

  it("tokens", () => {
    expect(redact(`token ${fake("ghp_", 36)} rejected`)).toBe("token <token> rejected");
    expect(redact(`use ${fake("glpat-", 20)} now`)).toBe("use <token> now");
    expect(redact(fake("github_pat_", 30))).toBe("<token>");
    expect(redact(`Authorization: Bearer ${fake("eyJ", 24)}`)).toBe("Authorization: Bearer <token>");
    expect(redact("your token has expired")).toBe("your token has expired");
    expect(redact(`key ${fake("AKIA", 36)} leaked`)).toBe("key <token> leaked");
    // Short ones by their prefixes.
    expect(redact(`aws ${"AKIA" + "IOSFODNN7EXAMPLE"} set`)).toBe("aws <token> set");
    expect(redact(`slack ${fake("xoxb-", 12)} set`)).toBe("slack <token> set");
  });

  // What git, ssh and the forges actually print; the user's names go, git's words and codes stay.
  it.each([
    [
      "conflicted file",
      "CONFLICT (content): Merge conflict in Payroll.xlsx",
      "CONFLICT (content): Merge conflict in <path>",
    ],
    [
      "conflict kind",
      "CONFLICT (modify/delete): Q3 plan.docx deleted in HEAD and modified in acme.",
      "CONFLICT (modify/delete): <path>",
    ],
    [
      "pathspec",
      "error: pathspec 'customer-acme-rollout' did not match any file(s) known to git",
      "error: pathspec '<name>' did not match any file(s) known to git",
    ],
    [
      "branch exists",
      "fatal: A branch named 'acme-layoffs' already exists.",
      "fatal: A branch named '<name>' already exists.",
    ],
    ["branch not found", "error: branch 'payroll' not found.", "error: branch '<name>' not found."],
    ["deleted branch", "Deleted branch acme-hotfix (was 3f2a9c4).", "Deleted branch <ref> (was 3f2a9c4)."],
    ["refspec", "error: src refspec acme-launch does not match any", "error: src refspec <ref> does not match any"],
    ["remote ref", "fatal: couldn't find remote ref acme-launch", "fatal: couldn't find remote ref <ref>"],
    [
      "rejected push",
      " ! [rejected]        acme -> acme (fetch first)\nerror: failed to push some refs to 'git@github.com:acme/secret.git'",
      " ! [rejected]        <ref> -> <ref> (fetch first)\nerror: failed to push some refs to '<url>'",
    ],
    [
      "diverged",
      "Your branch and 'origin/acme' have diverged, and have 2 and 3 different commits each, respectively.",
      "Your branch and '<path>' have diverged, and have 2 and 3 different commits each, respectively.",
    ],
    [
      "overwritten files",
      "error: The following untracked working tree files would be overwritten by checkout:\n\tsalaries.csv\n\tq3/board deck.key\nPlease move or remove them before you switch branches.\nAborting",
      "error: The following untracked working tree files would be overwritten by checkout:\n\t<path>\n\t<path>\nPlease move or remove them before you switch branches.\nAborting",
    ],
    ["status list", "\tmodified:   payroll.xlsx", "\tmodified:   <path>"],
    [
      "resolve host",
      "fatal: unable to access: Could not resolve host: gitlab.internal.acme.corp",
      "fatal: unable to access: Could not resolve host: <host>",
    ],
    [
      "ssh connect",
      "ssh: connect to host git.acme.corp port 22: Connection refused",
      "ssh: connect to host <host> port 22: Connection refused",
    ],
    [
      "ssh one-word host",
      "ssh: Could not resolve hostname gitbox: Name or service not known",
      "ssh: Could not resolve hostname <host>: Name or service not known",
    ],
    ["ip", "Connection closed by 10.20.30.40 port 22", "Connection closed by <host> port 22"],
    [
      "basic auth",
      "remote: HTTP Basic: Access denied for user jdoe on gitlab.acme.corp",
      "remote: HTTP Basic: Access denied for user <user> on <name>",
    ],
    [
      "permission denied to",
      "remote: Permission to acme/secret.git denied to jdoe.",
      "remote: Permission to <path> denied to <user>.",
    ],
    [
      "auto-detected email",
      "fatal: unable to auto-detect email address (got 'jdoe@JOHNS-MACBOOK.(none)')",
      "fatal: unable to auto-detect email address (got '<email>')",
    ],
    [
      "gpg signer",
      'gpg: skipped "John Doe <john@x>": No secret key\nerror: gpg failed to sign the data',
      'gpg: skipped "<name>": No secret key\nerror: gpg failed to sign the data',
    ],
    [
      "public forge over ssh",
      "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.",
      "git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.",
    ],
    ["host key", "Host key verification failed.", "Host key verification failed."],
    [
      "known hosts",
      "Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.",
      "Warning: Permanently added 'github.com' (ED25519) to the list of known hosts.",
    ],
    [
      "index lock",
      "fatal: Unable to create 'index.lock': File exists.",
      "fatal: Unable to create 'index.lock': File exists.",
    ],
    [
      "git's advice",
      "hint: Updates were rejected because the tip of your current branch is behind\nhint: (e.g., 'git pull ...') before pushing again.",
      "hint: Updates were rejected because the tip of your current branch is behind\nhint: (e.g., 'git pull ...') before pushing again.",
    ],
    [
      "identity",
      "Please tell me who you are. Run git config --global user.email and user.name to set it.",
      "Please tell me who you are. Run git config --global user.email and user.name to set it.",
    ],
    [
      "curl error",
      "error: RPC failed; curl 92 HTTP/2 stream 5 was not closed cleanly: CANCEL (err 8)\nfatal: early EOF",
      "error: RPC failed; curl 92 HTTP/2 stream 5 was not closed cleanly: CANCEL (err 8)\nfatal: early EOF",
    ],
    ["dotfile", "cannot read .env.production", "cannot read <name>"],
    [
      "stack frame",
      "TypeError: Cannot read properties of undefined (reading 'length')\n    at Array.map (<anonymous>)",
      "TypeError: Cannot read properties of undefined (reading '<name>')\n    at Array.map (<anonymous>)",
    ],
  ])("git message: %s", (_, input, out) => {
    expect(redact(input)).toBe(out);
  });

  it("keeps commit ids, versions, times and plain words", () => {
    const sha = "3f2a9c41d0b8e7f6a5b4c3d2e1f00112233445566";
    expect(redact(`could not apply ${sha}... Fix crash`)).toBe(`could not apply ${sha}... Fix crash`);
    expect(redact("git version 2.47.0 at 12:30:45")).toBe("git version 2.47.0 at 12:30:45");
    expect(redact("git version 2.47.0.windows.1")).toBe("git version 2.47.0.windows.1");
    expect(redact("git version 2.39.5 (Apple Git-154)")).toBe("git version 2.39.5 (Apple Git-154)");
    expect(redact("Merge conflict in 2 files")).toBe("Merge conflict in 2 files");
    expect(redact("can't lock ref; you don't have it")).toBe("can't lock ref; you don't have it");
    expect(redact("stash@{0} and HEAD@{2} are fine")).toBe("stash@{0} and HEAD@{2} are fine");
  });
});
