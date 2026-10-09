// Keyboard shortcuts for repository commands (⌘/Ctrl + Shift + a letter).

import { expect, test } from "./fixtures";

test("command keys: new branch, stash, fetch, commit panel; listed with the shortcuts", async ({ demo }) => {
  const { page } = demo;
  await page.keyboard.press("Control+Shift+B");
  const name = page.locator(".dialog").filter({ hasText: "새 브랜치" });
  await expect(name).toBeVisible();
  // Keys typed in the dialog's field stay there.
  await name.locator("input").first().press("Control+Shift+C");
  await expect(page.locator(".composer")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(name).toHaveCount(0);

  await page.keyboard.press("Control+Shift+S");
  await demo.toast("스태시에 보관했어요");
  expect((await demo.snapshot()).changes).toEqual([]);
  // Wait for the app to read the clean work tree (the commit button's count goes), as a user would.
  await expect(page.locator(".topbar button", { hasText: "커밋" }).locator(".count")).toHaveCount(0);
  await page.keyboard.press("Control+Shift+S");
  await demo.toast("보관할 변경이 없어요");

  const fetch = page.locator(".topbar").getByRole("button", { name: "Fetch" });
  await expect(fetch).toHaveAttribute("title", /⌘\/Ctrl \+ Shift \+ F/);
  await page.keyboard.press("Control+Shift+F");
  await demo.toast("원격 커밋을 가져왔어요");
  // ⌘/Ctrl+Shift+F is not the search bar's ⌘/Ctrl+F.
  await expect(page.locator(".search-bar")).toHaveCount(0);

  await page.keyboard.press("Control+Shift+C");
  await expect(page.locator(".composer")).toBeVisible();

  await page.getByRole("application").focus();
  await page.keyboard.press("?");
  const keys = page.getByRole("tabpanel", { name: "단축키" });
  for (const what of ["Fetch", "Pull", "Push", "새 브랜치", "모든 변경을 스태시에 보관", "커밋 창 열기"])
    await expect(keys.locator("tr").filter({ hasText: what }).first()).toBeVisible();
  await expect(keys.locator("tr").filter({ hasText: "커밋 창 열기" }).locator("kbd")).toHaveText("⌘/Ctrl + Shift + C");
});
