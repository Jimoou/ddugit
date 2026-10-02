import { describe, expect, it } from "vitest";
import { isSshUrl, sshHostOf, sshKeysPage, toHttps, toSsh } from "./sshUrl";

describe("ssh addresses", () => {
  it("switches between the HTTPS and SSH forms of a forge address", () => {
    expect(toSsh("https://github.com/owner/repo.git")).toBe("git@github.com:owner/repo.git");
    expect(toSsh("https://gitlab.com/group/sub/project")).toBe("git@gitlab.com:group/sub/project.git");
    expect(toHttps("git@github.com:owner/repo.git")).toBe("https://github.com/owner/repo.git");
    expect(toHttps(toSsh("https://github.com/a/b.git"))).toBe("https://github.com/a/b.git");
    expect(toSsh("/local/path")).toBe("/local/path");
  });

  it("recognises SSH addresses and their host", () => {
    expect(isSshUrl("git@github.com:o/r.git")).toBe(true);
    expect(isSshUrl("ssh://git@host:2222/x.git")).toBe(true);
    expect(isSshUrl("https://github.com/o/r")).toBe(false);
    expect(sshHostOf("ssh://git@Host.example:2222/x.git")).toBe("host.example");
    expect(sshHostOf("git@github.com:o/r.git")).toBe("github.com");
    expect(sshKeysPage("github.com")).toContain("github.com/settings/ssh");
    expect(sshKeysPage("git.example.com")).toBeNull();
  });
});
