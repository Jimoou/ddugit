// Settings, the license, language, the tutorial and update notices.

import { demoFlags, expect, test } from "./fixtures";

test("settings: shortcut table, sparkles and git path", async ({ demo }) => {
  const { page } = demo;
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 40, y: 40 } });
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "설정" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("kbd", { hasText: "⌘/Ctrl + F" })).toBeVisible();
  // Mouse gestures read as words, not keys.
  await expect(dialog.locator(".gesture", { hasText: "우클릭" })).toBeVisible();

  await dialog.getByRole("tab", { name: "화면" }).click();
  await dialog.getByLabel(/반짝임 효과/).uncheck();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!).animate)).toBe(false);
  // The space backdrop and the glow switch off on their own (the graph keeps drawing).
  await dialog.getByLabel(/우주 배경/).uncheck();
  await dialog.getByLabel(/빛 번짐/).uncheck();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!))).toMatchObject({
    space: false,
    glow: false,
  });

  await dialog.getByRole("tab", { name: "Git" }).click();
  const git = dialog.getByPlaceholder("비워 두면 PATH의 git");
  await git.fill("/usr/bin/nope");
  await dialog.getByRole("button", { name: "확인하고 적용" }).click();
  await expect(dialog.locator(".note.warn")).toContainText("not a git executable");
  await git.fill("/opt/homebrew/bin/git");
  await dialog.getByRole("button", { name: "확인하고 적용" }).click();
  await expect(dialog.locator(".note")).toContainText("git version");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("settings: a commercial license is pasted, shown and removed", async ({ demo }) => {
  const { page } = demo;
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByRole("tab", { name: "라이선스" }).click();
  const lic = dialog.locator("section.license");
  await expect(lic).toContainText("ddugit.com 계정으로 로그인해 활성화");
  // Pasting is for air-gapped and site licenses: folded away until asked for.
  await expect(lic.getByLabel("라이선스 붙여 넣기")).toBeHidden();
  await lic.locator(".license-paste summary").click();
  await expect(lic).toContainText("오프라인 활성화 코드");
  await lic.getByLabel("라이선스 붙여 넣기").fill("not a license");
  await lic.getByRole("button", { name: "라이선스 적용" }).click();
  await expect(lic.locator(".note.warn")).toContainText("not a ddugit license");
  await lic.getByLabel("라이선스 붙여 넣기").fill("DDUGIT1.payload.signature");
  await lic.getByRole("button", { name: "라이선스 적용" }).click();
  await expect(lic).toContainText("Demo Corp");
  await expect(lic).toContainText("2027-10-02까지 나온 버전");
  await lic.getByRole("button", { name: /라이선스 지우기/ }).click();
  await expect(lic).toContainText("ddugit.com 계정으로 로그인해 활성화");
});

test("settings: Pro is activated by signing in on ddugit.com, and the wait can be cancelled", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  await page.getByRole("dialog", { name: "설정" }).getByRole("tab", { name: "라이선스" }).click();
  const lic = page.getByRole("dialog", { name: "설정" }).locator("section.license");
  await lic.getByRole("button", { name: "ddugit.com 계정으로 활성화" }).click();
  await expect(lic.locator(".license-waiting")).toContainText("브라우저에서 로그인을 마치면");
  await lic.getByRole("button", { name: "그만두기" }).click();
  await expect(lic.getByRole("button", { name: "ddugit.com 계정으로 활성화" })).toBeVisible();
  await expect(lic.locator(".note.warn")).toHaveCount(0);

  await lic.getByRole("button", { name: "ddugit.com 계정으로 활성화" }).click();
  await expect(lic.locator(".license-plan")).toContainText("Pro 사용 중");
  await expect(lic).toContainText("평생 라이선스");
  await expect(lic).toContainText("평생 업데이트");
  await expect(lic.locator(".license-devices")).toContainText("기기 3대까지 · ddugit.com/account에서 기기 관리");
  await expect(lic).not.toContainText(/구독|체험/);
});

test("settings: a device-bound license is removed from this device and Pro closes", async ({ demo }) => {
  const { page } = demo;
  await demo.mutateQuietly((d) => {
    d.setLicense("lifetime");
    d.offline = true;
  });
  await page.locator(".tabrow-settings").click();
  await page.getByRole("dialog", { name: "설정" }).getByRole("tab", { name: "라이선스" }).click();
  const lic = page.getByRole("dialog", { name: "설정" }).locator("section.license");
  await expect(lic.locator(".license-plan")).toContainText("Pro 사용 중");
  // Device-bound: no plain "remove", a confirmed "remove from this device" instead.
  await expect(lic.getByRole("button", { name: /라이선스 지우기/ })).toHaveCount(0);
  await lic.getByRole("button", { name: "이 기기에서 해제" }).click();
  await expect(lic.locator(".license-ask")).toContainText("해제할까요");
  await lic.getByRole("button", { name: "그만두기" }).click();
  await expect(lic.locator(".license-ask")).toHaveCount(0);
  await lic.getByRole("button", { name: "이 기기에서 해제" }).click();
  await lic.getByRole("button", { name: "해제", exact: true }).click();
  // Offline: removed here anyway, and told to remove it on the website too.
  await expect(lic.locator(".license-notice")).toContainText("ddugit.com/account에서도");
  await expect(lic.locator(".license-plan")).toContainText("Free");
  await expect(lic.getByRole("button", { name: "ddugit.com 계정으로 활성화" })).toBeVisible();
});

test("a device removed on ddugit.com loses its license at the next check", async ({ demo }) => {
  const { page } = demo;
  await demoFlags(page, { License: { kind: "lifetime", deviceRemoved: true } });
  await page.reload();
  await demo.toast("이 기기는 라이선스에서 해제됐어요");
  await page.keyboard.press("?");
  const settings = page.getByRole("dialog", { name: "설정" });
  await settings.getByRole("tab", { name: "라이선스" }).click();
  const lic = settings.locator("section.license");
  await expect(lic.locator(".license-plan")).toContainText("Free");
  await expect(lic.getByRole("button", { name: "ddugit.com 계정으로 활성화" })).toBeVisible();
});

test("settings: switching to English relabels the app and is remembered", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByLabel("언어").selectOption("en");
  await expect(page.getByRole("dialog", { name: "Settings" })).toContainText("Shortcuts");
  await page.keyboard.press("Escape");
  await expect(page.locator(".topbar")).toContainText("Commit");
  await expect(page.locator(".hint")).toContainText("Drag to pan");
  await page.locator(".topbar").getByText("Commit").click();
  await expect(page.locator(".composer")).toContainText("New commit");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.locator(".topbar")).toContainText("Demo");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
});

test("settings: the light theme repaints the window and the map, and is remembered", async ({ demo }) => {
  const { page } = demo;
  const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
  const paper = () =>
    page.evaluate(() => {
      // The map's backdrop at a corner, away from lanes and labels.
      const c = document.querySelector<HTMLCanvasElement>(".app:not([hidden]) .graph-area canvas")!;
      const [r, g, b] = c.getContext("2d")!.getImageData(4, 4, 1, 1).data;
      return (r + g + b) / 3;
    });
  // Dark by default, whatever the OS uses.
  await page.emulateMedia({ colorScheme: "light" });
  expect(await theme()).toBe("dark");
  expect(await paper()).toBeLessThan(60);

  await page.locator(".tabrow-settings").click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  const themes = dialog.getByRole("radiogroup", { name: "테마" });
  // "System" follows the OS while it changes.
  await themes.getByRole("radio", { name: "시스템" }).click();
  await expect.poll(theme).toBe("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(theme).toBe("dark");

  await themes.getByRole("radio", { name: "밝게" }).click();
  await expect.poll(theme).toBe("light");
  await page.keyboard.press("Escape");
  await expect.poll(paper).toBeGreaterThan(200);
  // The window around the map turns too.
  const bg = await page.evaluate(() => getComputedStyle(document.querySelector(".topbar")!).backgroundColor);
  expect(bg).toBe("rgb(246, 244, 239)");

  await page.reload();
  await expect.poll(theme).toBe("light");
});

test("the tutorial voyage ticks off missions as they are done, and can be closed and reopened", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => localStorage.setItem("ddugit.voyage", JSON.stringify({ done: [], dismissed: false })));
  await page.reload();
  const log = page.getByRole("complementary", { name: "튜토리얼" });
  await expect(log).toContainText("0 / 6");
  await expect(log.locator("li.now")).toContainText("커밋 살펴보기");

  // Mission 1: look at a commit.
  const snap = await demo.snapshot();
  const at = (await demo.screenOf(snap.head.target!))!;
  await page.mouse.click(at.x, at.y);
  await expect(log).toContainText("1 / 6");
  await expect(log.locator("li.now")).toContainText("커밋하기");

  // Mission 6 out of order: push.
  await page.getByRole("button", { name: /Push/ }).click();
  await demo.confirmSync();
  await demo.toast("원격에 올렸어요");
  await expect(log).toContainText("2 / 6");
  await expect(log.locator("li.done")).toHaveCount(2);

  // Closed, it stays closed after a reload; the demo badge brings it back with progress kept.
  await log.getByRole("button", { name: "닫기" }).click();
  await expect(log).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".tab.on")).toContainText("ddugit-demo");
  await expect(log).toHaveCount(0);
  await page.getByRole("button", { name: /데모/ }).click();
  await expect(log).toContainText("2 / 6");
});

test("a newer version shows an update notice that installs or waits", async ({ demo }) => {
  const { page } = demo;
  await expect(page.locator(".update-notice")).toHaveCount(0);
  await demoFlags(page, { Update: { version: "9.9.9", notes: null } });
  await page.reload();
  const notice = page.locator(".update-notice");
  await expect(notice).toContainText("9.9.9");
  // It sits above the topbar instead of over its actions.
  const box = (await notice.boundingBox())!;
  const push = (await page.locator(".topbar button", { hasText: "Push" }).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(push.y);
  await notice.locator("button.ghost").click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await page.locator(".update-notice button.primary").click();
  await expect(page.locator(".update-notice")).toHaveCount(0);
});

test("settings: a smaller history size reads the repository again with fewer commits", async ({ demo }) => {
  const { page } = demo;
  // A history longer than the smallest size.
  await demo.mutate((d) => d.grow(1000));
  const all = (await demo.snapshot()).commits;
  const drawn = (id: string) => page.evaluate((id) => window.__ddugit.screenOf(id), id);
  const hint = page.locator(".app:not([hidden]) .stage-graph .hint");
  await expect.poll(() => drawn(all[all.length - 1].id)).not.toBeNull();
  await expect(hint).not.toContainText("표시 중");

  await page.locator(".tabrow-settings").click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByLabel("한 번에 불러올 커밋").selectOption("1000");
  await page.keyboard.press("Escape");
  await expect(hint).toContainText("최근 1000개 표시 중");
  await expect.poll(() => drawn(all[all.length - 1].id)).toBeNull();
  expect(await drawn(all[999].id)).not.toBeNull();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!).historyPage)).toBe(1000);
});
