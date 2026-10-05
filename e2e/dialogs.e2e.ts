import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/** Esc closes `layer` wherever focus is, and only that layer. */
async function escCloses(page: Page, layer: Locator) {
  await expect(layer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(layer).toHaveCount(0);
}

test("Esc closes the repository menu and the dialogs opened from the sidebar", async ({ demo }) => {
  const { page } = demo;
  const sidebar = page.locator(".app:not([hidden]) .sidebar");

  // Repository menu, and the clone dialog opened from it.
  await page.locator(".tab.on .tab-menu").click();
  await escCloses(page, page.locator(".repo-menu"));
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  await escCloses(page, page.locator(".dialog.clone"));

  await sidebar.locator(".worktrees").getByRole("button", { name: "worktree 추가" }).click();
  await escCloses(page, page.locator(".worktree-dialog"));

  await sidebar.locator("button[title='폐쇄망 반출입']").click();
  await escCloses(page, page.locator(".dialog.transfer"));

  await page.click(".sidebar li >> text=v0.2.0", { button: "right" });
  await page.click(".context-menu >> text=여기까지 릴리스 노트 만들기");
  await escCloses(page, page.locator(".dialog.notes"));
});

test("Esc closes sheets, and a menu over a sheet closes alone", async ({ demo }) => {
  const { page } = demo;
  const sidebar = page.locator(".app:not([hidden]) .sidebar");
  await page.getByRole("button", { name: "브랜치 정리" }).click();
  const cleanup = page.locator(".cleanup-sheet");
  await expect(cleanup).toBeVisible();
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await escCloses(page, page.locator(".context-menu"));
  await escCloses(page, cleanup);

  await sidebar.getByLabel(/백포트: 다른 브랜치에만 있는 커밋/).click();
  await escCloses(page, page.locator(".backport-sheet"));

  await page.getByRole("button", { name: "되돌리기 기록 (reflog)" }).click();
  await escCloses(page, page.locator(".reflog-sheet"));
});

test("Esc closes only the topmost of two dialogs", async ({ demo }) => {
  const { page } = demo;
  // The token dialog over "new PR": Esc closes the token dialog alone, then the PR dialog.
  await demo.mutate((d) => (d.forgeToken = "none"));
  await page.locator(".sidebar li", { hasText: "feature/theme" }).first().click({ button: "right" });
  await page.click(".context-menu >> text=PR 만들기…");
  const pr = page.getByRole("dialog", { name: "PR 만들기" });
  await pr.getByRole("button", { name: "GitHub 연결" }).click();
  await escCloses(page, page.getByRole("dialog", { name: "GitHub 연결" }));
  await escCloses(page, pr);

  // Going back to a commit asks first; that dialog is labelled by its title.
  const snap = await demo.snapshot();
  const parent = snap.commits.find((c) => c.id === snap.head.target)!.parents[0];
  await (await demo.commitMenu(parent)).getByText("이 커밋으로 되돌리기").click();
  await escCloses(page, page.getByRole("dialog", { name: "되돌리기" }));
});

test("? opens settings at the shortcut table; Esc closes it", async ({ demo }) => {
  const { page } = demo;
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "설정" });
  const keys = dialog.getByRole("region", { name: "단축키" });
  await expect(keys).toBeFocused();
  await expect(keys).toBeInViewport();
  await escCloses(page, dialog);
});

test("Tab stays inside a modal dialog, and focus goes back to the opener", async ({ demo }) => {
  const { page } = demo;
  const opener = page.locator(".app:not([hidden]) .sidebar .worktrees").getByRole("button", { name: "worktree 추가" });
  await opener.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "worktree 추가" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  const inside = () => dialog.evaluate((el) => el.contains(document.activeElement));
  await expect.poll(inside).toBe(true);

  const stops = await dialog.evaluate(
    (el) => [...el.querySelectorAll("button:not([disabled]), input:not([disabled]), select, textarea")].length,
  );
  for (let i = 0; i < stops + 2; i++) {
    await page.keyboard.press("Tab");
    expect(await inside()).toBe(true);
  }
  for (let i = 0; i < stops + 2; i++) {
    await page.keyboard.press("Shift+Tab");
    expect(await inside()).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("on Free, the Pro offer over a dialog closes with Esc, then the dialog", async ({ demo }) => {
  const { page } = demo;
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__ddugitDemoPro = { pro: false, source: "free", trialDaysLeft: 0 };
  });
  await page.reload();
  await page.locator(".sidebar button[title='폐쇄망 반출입']").click();
  const transfer = page.locator(".dialog.transfer");
  await transfer.getByPlaceholder("예: 고객사 이름").fill("acme");
  await transfer.getByRole("button", { name: /폴더 고르고 반출/ }).click();
  const offer = page.getByRole("dialog", { name: "ddugit Pro" });
  await expect(offer).toHaveAttribute("aria-modal", "true");
  await escCloses(page, offer);
  await escCloses(page, transfer);
});
