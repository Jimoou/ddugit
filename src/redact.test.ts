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
    expect(redact("remote https://kim:ghp_abcdef1234567890@github.com/acme/api.git")).toBe("remote <url>");
    expect(redact("https://oauth2:glpat-xyzXYZ123@gitlab.com/a/b")).toBe("<url>");
    expect(redact("ssh://git@git.acme.corp:2222/x.git refused")).toBe("<url> refused");
    expect(redact("git@github.com:acme/private.git: Permission denied")).toBe("<url> Permission denied");
  });

  it("emails", () => {
    expect(redact("Author: Kim <kim.dev+git@acme-corp.co.kr>")).toBe("Author: Kim <<email>>");
  });

  it("tokens", () => {
    expect(redact(`token ${fake("ghp_", 36)} rejected`)).toBe("token <token> rejected");
    expect(redact(`use ${fake("glpat-", 20)} now`)).toBe("use <token> now");
    expect(redact(fake("github_pat_", 30))).toBe("<token>");
    expect(redact(`Authorization: Bearer ${fake("eyJ", 24)}`)).toBe("Authorization: Bearer <token>");
    expect(redact("your token has expired")).toBe("your token has expired");
    expect(redact(`key ${fake("AKIA", 36)} leaked`)).toBe("key <token> leaked");
  });

  it("keeps commit ids, versions and plain words", () => {
    const sha = "3f2a9c41d0b8e7f6a5b4c3d2e1f00112233445566";
    expect(redact(`could not apply ${sha}... Fix crash`)).toBe(`could not apply ${sha}... Fix crash`);
    expect(redact("git version 2.47.0 at 12:30:45")).toBe("git version 2.47.0 at 12:30:45");
    expect(redact("Merge conflict in 2 files")).toBe("Merge conflict in 2 files");
  });
});
