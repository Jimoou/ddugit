import { test as base } from "@playwright/test";
import { expect, test } from "./fixtures";

// A crash logs React's error to the console, which the demo fixture counts as a failure; this one expects it.
base("a tab that crashes while rendering shows a notice, and the other tabs keep working", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("ddugit.voyage", JSON.stringify({ done: [], dismissed: true }));
  });
  await page.goto("/");
  await expect(page.locator(".app:not([hidden]) .topbar")).toBeVisible();
  // A second tab (the new-tab screen) to switch to.
  await page.keyboard.press("Control+t");
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(2);
  await page.locator(".tabbar .tab:not(.tab-home)").first().click();

  await page.evaluate(() => {
    (window as unknown as { __ddugitDemo: { crashTab: boolean } }).__ddugitDemo.crashTab = true;
    window.dispatchEvent(new Event("focus"));
  });
  const notice = page.locator(".crashed:not([hidden])");
  await expect(notice).toContainText("이 탭에서 문제가 생겼어요.");

  // The rest of the window still answers: the other tab opens.
  await page.locator(".tabbar .tab:not(.tab-home)").nth(1).click();
  await expect(page.locator(".welcome .brand")).toBeVisible();
  await page.locator(".tabbar .tab:not(.tab-home)").first().click();

  // Report it: the dialog opens with the error in its diagnostics.
  await notice.getByRole("button", { name: "문제 신고" }).click();
  const dialog = page.getByRole("dialog", { name: "문제 신고" });
  await expect(dialog.getByLabel("진단 정보", { exact: true })).toHaveValue(/Last error:\nError: Demo tab crashed/);
  await dialog.getByRole("button", { name: "닫기" }).click();

  // Reloading the tab brings the repository back.
  await page.evaluate(() => {
    (window as unknown as { __ddugitDemo: { crashTab: boolean } }).__ddugitDemo.crashTab = false;
  });
  await notice.getByRole("button", { name: "탭 다시 불러오기" }).click();
  await expect(page.locator(".app:not([hidden]) .topbar")).toBeVisible();
});

test("a malformed stored list of dismissed hints doesn't break the dashboard", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    localStorage.setItem("ddugit.groupHints", "{}");
    const paths = ["/work/rocket", "/srv/api-server"];
    localStorage.setItem("ddugit.recent", JSON.stringify(paths.map((path, i) => ({ path, starred: false, at: i }))));
  });
  await page.reload();
  await page.locator(".tab-home").click();
  await expect(page.locator(".welcome .galaxy .world")).toHaveCount(2);
});
