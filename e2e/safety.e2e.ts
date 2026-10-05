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

test("the smallest window (900×560) keeps every screen inside it, controls unclipped and apart", async ({ demo }) => {
  const { page } = demo;
  await page.setViewportSize({ width: 900, height: 560 });
  const view = { width: 900, height: 560 };
  /** Fully inside the window, and not cut off by its own box (no hidden overflow). */
  const inside = async (what: string, locator: ReturnType<typeof page.locator>) => {
    // Panels slide in: measure where they come to rest.
    await locator.evaluate((el) => Promise.all(el.getAnimations({ subtree: true }).map((a) => a.finished)));
    const box = (await locator.boundingBox())!;
    expect(box, what).not.toBeNull();
    expect(box.x, `${what} left`).toBeGreaterThanOrEqual(-0.5);
    expect(box.y, `${what} top`).toBeGreaterThanOrEqual(-0.5);
    expect(box.x + box.width, `${what} right`).toBeLessThanOrEqual(view.width + 0.5);
    expect(box.y + box.height, `${what} bottom`).toBeLessThanOrEqual(view.height + 0.5);
    return box;
  };
  const noPageScroll = async (what: string) =>
    expect(
      await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight]),
      what,
    ).toEqual([view.width, view.height]);
  /** Every visible control in `scope` is whole (its text not clipped) and none overlaps the next. */
  const controlsApart = async (what: string, scope: ReturnType<typeof page.locator>) => {
    const boxes = await scope.evaluate((root) =>
      [...root.querySelectorAll<HTMLElement>("button, select, input:not([type=checkbox]):not([type=radio])")]
        .filter((el) => el.offsetParent !== null && el.getClientRects().length > 0)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            name: el.getAttribute("aria-label") ?? el.title ?? el.textContent?.trim() ?? el.tagName,
            x: r.x,
            y: r.y,
            w: r.width,
            h: r.height,
            clipped: el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible",
          };
        }),
    );
    for (const b of boxes) {
      expect(b.clipped, `${what}: "${b.name}" is clipped`).toBe(false);
      expect(b.x + b.w, `${what}: "${b.name}" runs off the window`).toBeLessThanOrEqual(view.width + 0.5);
    }
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const [a, b] = [boxes[i], boxes[j]];
        const overlap =
          Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 &&
          Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1;
        expect(overlap, `${what}: "${a.name}" overlaps "${b.name}"`).toBe(false);
      }
  };

  // The repository screen: top bar, sidebar and graph.
  await noPageScroll("repository");
  await inside("top bar", page.locator(".app:not([hidden]) .topbar"));
  await controlsApart("top bar", page.locator(".app:not([hidden]) .topbar"));
  for (const name of [/Fetch/, /Pull/, /Push/, /커밋/])
    await inside(`top bar ${name}`, page.locator(".topbar").getByRole("button", { name }).first());
  await inside("sidebar", page.locator(".app:not([hidden]) .sidebar"));
  await inside("graph", page.locator(".app:not([hidden]) .graph-area canvas"));

  // The composer beside the graph.
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const composer = page.locator(".composer");
  await inside("composer", composer);
  await inside("commit button", composer.locator("button.primary"));
  await controlsApart("composer", composer);
  await page.keyboard.press("Escape");

  // The interactive rebase sheet.
  await demo.mutate((d) => d.grow(3));
  const snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  let base = snap.head.target!;
  for (let i = 0; i < 3; i++) base = byId.get(base)!.parents[0];
  await (await demo.commitMenu(base)).getByText("이후 커밋 정리").click();
  const sheet = page.locator(".rebase-sheet");
  await inside("rebase sheet", sheet);
  await inside("rebase go", sheet.locator("button.primary"));
  await controlsApart("rebase sheet", sheet);
  await noPageScroll("rebase sheet");
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);

  // Settings.
  await page.locator(".tabrow-settings").click();
  const settings = page.getByRole("dialog", { name: "설정" });
  await inside("settings", settings);
  await controlsApart("settings", settings);
  await page.keyboard.press("Escape");

  // My repositories (the dashboard) with a few cards.
  await page.evaluate(() => {
    const paths = ["/work/rocket", "/work/api-gateway", "/srv/payments-service-long-name"];
    localStorage.setItem("ddugit.recent", JSON.stringify(paths.map((path, i) => ({ path, starred: false, at: i }))));
  });
  await page.reload();
  await page.locator(".tab-home").click();
  const galaxy = page.locator(".welcome .galaxy");
  await expect(galaxy.locator(".world")).toHaveCount(3);
  await expect(galaxy.locator(".world-branch")).toHaveCount(3);
  await noPageScroll("dashboard");
  for (const card of await galaxy.locator(".world").all()) {
    const box = (await card.boundingBox())!;
    expect(box.x + box.width, "dashboard card").toBeLessThanOrEqual(view.width + 0.5);
  }
  await controlsApart("dashboard toolbar", galaxy.locator(".galaxy-head").first());
});
