// Comparing two revisions in the diff sheet, and saving a file as a commit had it.

import { expect, test } from "./fixtures";

test("compares a branch with the current one, both ways and tip to tip", async ({ demo }) => {
  const { page } = demo;
  const head = (await demo.snapshot()).head.branch!;
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page
    .locator(".context-menu")
    .getByRole("menuitem", { name: new RegExp(`^${head}[과와] 비교`) })
    .click();

  const sheet = page.locator(".diff-sheet");
  await expect(sheet.locator(".title b")).toHaveText(`${head} … feature/theme`);
  await expect(sheet.locator(".file-list li.on")).toHaveCount(1);
  // Read-only: no staging controls; what the branch adds since they split.
  await expect(sheet.locator(".hunk-btn")).toHaveCount(0);
  await expect(sheet.getByRole("tab", { name: "갈라진 지점부터" })).toHaveAttribute("aria-selected", "true");

  await sheet.getByRole("button", { name: "양쪽 바꾸기" }).click();
  await expect(sheet.locator(".title b")).toHaveText(`feature/theme … ${head}`);
  await sheet.getByRole("tab", { name: "두 끝 그대로" }).click();
  await expect(sheet.getByRole("tab", { name: "두 끝 그대로" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.locator(".file-list li.on")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
});

test("compares two commits picked one after the other, and a commit with HEAD", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  const a = byId.get(snap.head.target!)!.parents[0];
  const b = byId.get(a)!.parents[0];

  await (await demo.commitMenu(b)).getByRole("menuitem", { name: "비교할 커밋으로 고르기" }).click();
  const banner = page.locator(".compare-banner");
  await expect(banner).toContainText(b.slice(0, 7));

  const withPicked = new RegExp(`^골라 둔 ${b.slice(0, 7)}[과와] 비교`);
  await (await demo.commitMenu(a)).getByRole("menuitem", { name: withPicked }).click();
  const sheet = page.locator(".diff-sheet");
  await expect(sheet.locator(".title b")).toHaveText(`${b.slice(0, 7)} … ${a.slice(0, 7)}`);
  await expect(sheet.getByRole("tab", { name: "두 끝 그대로" })).toHaveAttribute("aria-selected", "true");
  await expect(sheet.locator(".file-list li.on")).toHaveCount(1);
  await expect(banner).toHaveCount(0);

  await (await demo.commitMenu(b)).getByRole("menuitem", { name: "HEAD와 비교" }).click();
  await expect(sheet.locator(".title b")).toHaveText(`${b.slice(0, 7)} … ${snap.head.branch}`);
});

test("saves a file as a commit had it", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const id = snap.head.target!;
  const tip = (await demo.screenOf(id))!;
  await page.mouse.click(tip.x, tip.y);
  const file = page.locator(".inspector .changed li:not(.dir)").first();
  await file.click({ button: "right" });
  const path = (await page.locator(".context-menu .menu-title").textContent())!;
  await page.locator(".context-menu").getByRole("menuitem", { name: "이 버전을 다른 이름으로 저장…" }).click();

  const name = path
    .split("/")
    .pop()!
    .replace(/(\.[^.]+)?$/, ` (${id.slice(0, 7)})$1`);
  await demo.toast(`/work/${name}에 저장했어요`);
  const saved = await page.evaluate(() => window.__ddugitDemo.saved);
  expect(saved).toEqual([{ rev: id, file: path, dest: `/work/${name}` }]);

  // Cancelling the save dialog saves nothing.
  await demo.mutateQuietly((d) => (d.nextSave = null));
  await file.click({ button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: "이 버전을 다른 이름으로 저장…" }).click();
  await expect(page.locator(".context-menu")).toHaveCount(0);
  expect(await page.evaluate(() => window.__ddugitDemo.saved.length)).toBe(1);
});
