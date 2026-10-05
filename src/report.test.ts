import { beforeEach, describe, expect, it } from "vitest";
import { clearLog, diagnostics, type Facts, isUnexpected, logError, recentLog, reportText } from "./report";

beforeEach(clearLog);

describe("log buffer", () => {
  it("keeps the newest entries, oldest first", () => {
    for (let i = 0; i < 250; i++) logError("cmd:x", `e${i}`, i);
    const all = recentLog(1000);
    expect(all).toHaveLength(200);
    expect(all[0].text).toBe("e50");
    expect(recentLog(3).map((e) => e.text)).toEqual(["e247", "e248", "e249"]);
  });

  it("skips empty errors and keeps stacks of Error objects", () => {
    logError("window", "");
    logError("window", null);
    expect(recentLog()).toHaveLength(0);
    const err = new TypeError("x is undefined");
    logError("window", err);
    expect(recentLog()[0].text).toContain("x is undefined");
  });

  it("knows a toast that repeats a fresh command failure", () => {
    logError("cmd:git_commit", "Failed to run git (is it installed and on PATH?)", 1000);
    expect(isUnexpected("Failed to run git (is it installed and on PATH?)", 2000)).toBe(true);
    expect(isUnexpected("Can't use it: Failed to run git (is it installed and on PATH?)", 2000)).toBe(true);
    // Too old, or a different text.
    expect(isUnexpected("Failed to run git (is it installed and on PATH?)", 60_000)).toBe(false);
    expect(isUnexpected("Merge failed", 2000)).toBe(false);
    // Uncaught window errors are logged but never toasted as command failures.
    logError("window", "boom", 1000);
    expect(isUnexpected("boom", 2000)).toBe(false);
  });

  it("does not offer reports for cancellations or the Pro line", () => {
    logError("cmd:license_activate", "Cancelled", 1000);
    logError("cmd:stack_op", "This is a ddugit Pro feature", 1000);
    expect(isUnexpected("Cancelled", 1500)).toBe(false);
    expect(isUnexpected("This is a ddugit Pro feature", 1500)).toBe(false);
  });
});

const facts = (over: Partial<Facts> = {}): Facts => ({
  version: "1.0.0",
  os: "macos",
  osVersion: "15.1",
  arch: "aarch64",
  git: "git version 2.47.0",
  locale: "ko-KR (app: ko)",
  plan: "Free",
  lastError: null,
  log: [],
  ...over,
});

describe("diagnostics", () => {
  it("lists the facts without anything that names the user's work", () => {
    const text = diagnostics(
      facts({
        lastError: "fatal: '/Users/kim/acme-secret' does not appear to be a git repository",
        log: [
          { at: 0, source: "cmd:git_remote", text: "fatal: unable to access 'https://kim:tok@git.acme.corp/x.git/'" },
          { at: 1000, source: "window", text: "TypeError: boom\n    at C:\\Users\\kim\\app.js:1" },
        ],
      }),
    );
    expect(text).toContain("ddugit 1.0.0");
    expect(text).toContain("OS: macos 15.1 (aarch64)");
    expect(text).toContain("Plan: Free");
    expect(text).toContain("Last error:\nfatal: '<path>' does not appear");
    expect(text).toContain("1970-01-01T00:00:01.000Z [window] TypeError: boom | at <path>");
    expect(text).not.toMatch(/kim|acme|tok@/);
  });

  it("puts the reply address between the description and the diagnostics", () => {
    expect(reportText(" It froze. ", "me@example.com", "ddugit 1.0.0")).toBe(
      "It froze.\n\nReply to: me@example.com\n\n---\n\nddugit 1.0.0",
    );
    expect(reportText("It froze.", " ", "d")).toBe("It froze.\n\n---\n\nd");
  });
});
