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
    window.__ddugitDemo.crashTab = true;
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
    window.__ddugitDemo.crashTab = false;
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

test("a second git operation is refused while one is still running", async ({ demo }) => {
  const { page } = demo;
  const before = (await demo.snapshot()).head.branch;
  expect(before).not.toBe("feature/theme");
  await demo.mutateQuietly((d) => (d.slow = 2500));
  await page.getByRole("button", { name: /Fetch/ }).click();
  await expect(page.locator(".job-card")).toBeVisible();

  // A checkout from the branch menu meanwhile: refused, and the fetch's progress card stays.
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: "체크아웃", exact: true }).click();
  await demo.toast("다른 작업이 아직 진행 중이에요");
  await expect(page.locator(".job-card")).toBeVisible();

  await demo.toast("원격 커밋을 가져왔어요");
  expect((await demo.snapshot()).head.branch).toBe(before);
  await demo.mutateQuietly((d) => (d.slow = 0));
});

test("a selection dragged out of a dialog onto the scrim keeps the dialog open", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".app:not([hidden]) .sidebar").getByRole("button", { name: "새 브랜치…" }).click();
  const input = page.locator(".dialog input.text");
  await input.fill("spike/half-typed");
  const box = (await input.boundingBox())!;
  // Press in the field, drag out past the dialog and release over the scrim.
  await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(5, 5, { steps: 5 });
  await page.mouse.up();
  await expect(input).toHaveValue("spike/half-typed");

  // A click that starts on the scrim still closes it.
  await page.mouse.click(5, 5);
  await expect(page.locator(".dialog")).toHaveCount(0);
});

test("Esc that closes a menu keeps the selected commit", async ({ demo }) => {
  const { page } = demo;
  const at = (await demo.screenOf((await demo.snapshot()).head.target!))!;
  await page.mouse.click(at.x, at.y);
  const inspector = page.locator(".app:not([hidden]) .inspector");
  await expect(inspector).toBeVisible();

  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await expect(page.locator(".context-menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator(".context-menu")).toHaveCount(0);
  await expect(inspector).toBeVisible();

  // With nothing open, Esc clears the selection as before.
  await page.keyboard.press("Escape");
  await expect(inspector).toHaveCount(0);
});
