import { expect, test } from "./fixtures";

/** A path, a remote URL with a token and an email that must never reach a report. */
const SECRET =
  "fatal: cannot open '/Users/kim/acme-secret/x' via https://kim:ghp_abc123@git.acme.corp/a.git (kim@acme.corp)";

test("a report from settings → About is sent with redacted diagnostics", async ({ page, demo }) => {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.locator(".tabrow-settings").click();
  const settings = page.getByRole("dialog", { name: "설정" });
  await settings.getByRole("tab", { name: "정보" }).click();
  await expect(settings.locator(".about-facts")).toContainText("-demo");
  await settings.getByRole("button", { name: "문제 신고" }).click();

  const dialog = page.getByRole("dialog", { name: "문제 신고" });
  const diag = dialog.getByLabel("진단 정보", { exact: true });
  await expect(diag).toHaveValue(/Plan: Pro/);
  await expect(diag).toHaveValue(/Git: git version/);
  const send = dialog.getByRole("button", { name: "보내기" });
  await expect(send).toBeDisabled();
  await dialog.getByLabel("무슨 일이 있었나요?").fill("The graph went blank.");
  await dialog.getByLabel("답장 받을 이메일 (선택)").fill("me@example.com");

  // Copy is the offline fallback: the whole text, diagnostics included.
  await dialog.getByRole("button", { name: "복사" }).click();
  await expect(dialog.getByRole("status")).toHaveText("복사했어요.");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("The graph went blank.\n\nReply to: me@example.com\n\n---\n\nddugit ");

  // The site's rate limit: shown in the dialog, and nothing typed is lost.
  await demo.mutateQuietly((d) => (d.reportFail = "limited"));
  await send.click();
  await expect(dialog.getByRole("alert")).toHaveText("보내지 못했어요: Too many reports. Try again later.");
  await expect(dialog.getByLabel("무슨 일이 있었나요?")).toHaveValue("The graph went blank.");

  await demo.mutateQuietly((d) => (d.reportFail = null));
  await send.click();
  await demo.toast("보냈어요");
  await expect(dialog).toHaveCount(0);
  const sent = await page.evaluate(
    () => (window as unknown as { __ddugitDemo: { sent: unknown[] } }).__ddugitDemo.sent,
  );
  expect(sent).toHaveLength(2);
  expect(sent[1]).toMatchObject({ kind: "bug", message: "The graph went blank.", email: "me@example.com" });
  expect((sent[1] as { diagnostics: string }).diagnostics).toMatch(/^ddugit .*\nOS: /);
});

test("a question leaves diagnostics out unless asked", async ({ page, demo }) => {
  await page.locator(".tabrow-settings").click();
  await page.getByRole("dialog", { name: "설정" }).getByRole("tab", { name: "정보" }).click();
  await page.getByRole("button", { name: "문제 신고" }).click();
  const dialog = page.locator(".dialog.report");
  await dialog.getByRole("radio", { name: "문의" }).click();
  await expect(dialog.getByRole("heading", { name: "문의" })).toBeVisible();
  await expect(dialog.getByLabel("진단 정보 포함")).not.toBeChecked();
  await expect(dialog.getByLabel("진단 정보", { exact: true })).toHaveCount(0);
  await dialog.getByLabel("문의 내용").fill("Does it work offline?");
  await dialog.getByRole("button", { name: "보내기" }).click();
  await demo.toast("보냈어요");
  const sent = await page.evaluate(
    () => (window as unknown as { __ddugitDemo: { sent: unknown[] } }).__ddugitDemo.sent,
  );
  expect(sent).toEqual([{ kind: "question", message: "Does it work offline?", email: null, diagnostics: null }]);
});

test("an unexpected error toast offers a report with the error, redacted", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(
    (text) => ((window as unknown as { __ddugitDemo: { failNext: string } }).__ddugitDemo.failNext = text),
    SECRET,
  );
  await page
    .locator(".app:not([hidden]) .sidebar li")
    .filter({ hasText: /^main$/ })
    .first()
    .dblclick();
  const toast = page.locator(".toast.err").filter({ hasText: "acme-secret" });
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "신고" }).click();

  const diag = page.locator(".dialog.report").getByLabel("진단 정보", { exact: true });
  await expect(diag).toHaveValue(/Last error:\nfatal: cannot open '<path>' via <url> \(<email>\)/);
  await expect(diag).toHaveValue(/\[cmd:git_checkout\] fatal: cannot open/);
  const text = await diag.inputValue();
  expect(text).not.toMatch(/kim|acme|ghp_/);
});

test("the first screen offers every way in, and the shortcuts", async ({ demo }) => {
  const { page } = demo;
  await page.getByRole("button", { name: /새 탭/ }).click();
  const welcome = page.locator(".welcome");
  for (const name of ["폴더 열기…", "저장소 복제 (clone)", "새 저장소 만들기"])
    await expect(welcome.getByRole("button", { name })).toBeVisible();
  await expect(welcome).toContainText("GitHub·GitLab");
  await welcome.getByRole("button", { name: "? 단축키" }).click();
  await expect(page.getByRole("tab", { name: "단축키" })).toHaveAttribute("aria-selected", "true");
});

test("a missing git is reported at startup with a way to fix it", async ({ page }) => {
  await page.addInitScript(() => ((window as unknown as Record<string, unknown>).__ddugitDemoGitMissing = true));
  await page.goto("/");
  const notice = page.getByRole("dialog", { name: "Git을 찾을 수 없어요" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Can't run 'git'");
  await expect(notice.getByRole("button", { name: "Git 내려받기" })).toBeFocused();
  await notice.getByRole("button", { name: "Git 위치 지정" }).click();
  await expect(notice).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "설정" }).getByRole("tab", { name: "Git", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
});
