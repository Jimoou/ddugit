// Commits as patches (save, apply, am stopping on conflicts), several commits picked at
// once for cherry-pick or revert, and reverting a merge against the parent chosen.

import { expect, test } from "./fixtures";

const byName = async (demo: { snapshot(): Promise<{ commits: { id: string; summary: string }[] }> }, s: string) =>
  (await demo.snapshot()).commits.find((c) => c.summary === s)!.id;

test("saves a commit as a patch file, not a merge", async ({ demo }) => {
  const { page } = demo;
  const id = await byName(demo, "Minimap");
  await (await demo.commitMenu(id)).getByRole("menuitem", { name: "패치로 저장…" }).click();
  await demo.toast("/work/0001-minimap.patch에 저장했어요");
  expect(await page.evaluate(() => window.__ddugitDemo.savedPatches)).toEqual([
    { id, dest: "/work/0001-minimap.patch" },
  ]);

  const merge = await byName(demo, "Merge branch 'hotfix/crash' into main");
  const menu = await demo.commitMenu(merge);
  await expect(menu.getByRole("menuitem", { name: /패치로 저장/ })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "패치로 복사" })).toBeDisabled();
});

test("applies a patch from the branch menu, and an am that stops can be cancelled", async ({ demo }) => {
  const { page } = demo;
  const applyFromMenu = async () => {
    await page.locator(".topbar .branch-now").click();
    await page.locator(".context-menu").getByRole("menuitem", { name: "패치 적용…" }).click();
  };
  await applyFromMenu();
  await demo.toast("패치를 적용했어요");
  const snap = await demo.snapshot();
  expect(snap.commits.find((c) => c.id === snap.head.target)?.summary).toBe("Apply fix");

  // A conflict stops `am`: the banner says so and offers continue, skip and cancel.
  await demo.mutateQuietly((d) => (d.conflictNext = true));
  const tip = (await demo.snapshot()).head.target;
  await applyFromMenu();
  const banner = page.locator(".banner").filter({ hasText: "패치 적용 진행 중" });
  await expect(banner).toBeVisible();
  for (const name of ["계속", "건너뛰기", "취소"]) await expect(banner.getByRole("button", { name })).toBeVisible();
  await expect(page.locator(".conflict-sheet")).toContainText("패치의 변경");
  await banner.getByRole("button", { name: "취소" }).click();
  await expect(banner).toHaveCount(0);
  expect((await demo.snapshot()).head.target).toBe(tip);
});

test("picks several commits with Ctrl-click and cherry-picks them oldest first", async ({ demo }) => {
  const { page } = demo;
  const [a, b] = [await byName(demo, "Sparkle particles"), await byName(demo, "Tune particle speed")];
  // Newest first on purpose: the order of picking doesn't matter.
  await page.keyboard.down("Control");
  for (const id of [b, a]) {
    const at = (await demo.screenOf(id))!;
    await page.mouse.click(at.x, at.y);
  }
  await page.keyboard.up("Control");

  const menu = await demo.commitMenu(a);
  await menu.getByRole("menuitem", { name: "커밋 2개를 feature/graph-zoom에 cherry-pick" }).click();
  const dialog = page.locator(".dialog").filter({ hasText: "고른 커밋 2개" });
  await expect(dialog.locator("li")).toHaveCount(2);
  await dialog.getByRole("button", { name: "복사" }).click();
  await demo.toast("커밋 2개를 feature/graph-zoom에 복사했어요");
  expect(await page.evaluate(() => window.__ddugitDemo.lastPick)).toEqual({
    op: "cherryPick",
    ids: [a, b],
    mainline: null,
  });
  // The picks are done with.
  const again = await demo.commitMenu(a);
  await expect(again.getByRole("menuitem", { name: /커밋 2개/ })).toHaveCount(0);
});

test("Shift-click picks a line of commits to revert, newest first", async ({ demo }) => {
  const { page } = demo;
  const [older, newer] = [await byName(demo, "Semantic zoom levels"), await byName(demo, "Minimap")];
  const at = async (id: string) => (await demo.screenOf(id))!;
  const first = await at(newer);
  await page.mouse.click(first.x, first.y);
  await page.keyboard.down("Shift");
  const second = await at(older);
  await page.mouse.click(second.x, second.y);
  await page.keyboard.up("Shift");

  await (await demo.commitMenu(newer)).getByRole("menuitem", { name: "커밋 2개 되돌리기 (revert)" }).click();
  await page.locator(".dialog").getByRole("button", { name: "되돌리는 커밋 만들기" }).click();
  await demo.toast("커밋 2개를 되돌렸어요");
  expect(await page.evaluate(() => window.__ddugitDemo.lastPick?.ids)).toEqual([newer, older]);
});

test("reverts a merge keeping the parent chosen", async ({ demo }) => {
  const { page } = demo;
  const merge = await byName(demo, "Merge branch 'hotfix/crash' into main");
  await (await demo.commitMenu(merge)).getByRole("menuitem", { name: "병합 되돌리기 (revert)…" }).click();
  const dialog = page.locator(".dialog").filter({ hasText: "어느 쪽을 기준으로 남길까요?" });
  await expect(dialog.getByRole("radio")).toHaveCount(2);
  await expect(dialog.getByRole("radio").first()).toBeChecked();
  await dialog.getByRole("radio").nth(1).check();
  await dialog.getByRole("button", { name: "되돌리는 커밋 만들기" }).click();
  await demo.toast("되돌리는 커밋을 만들었어요");
  expect(await page.evaluate(() => window.__ddugitDemo.lastPick)).toEqual({
    op: "revert",
    ids: [merge],
    mainline: 2,
  });
});
