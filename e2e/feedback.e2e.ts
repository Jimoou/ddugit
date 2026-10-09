// Fixes from using the app: why a push failed, the whole list of commits to push, force push,
// refreshing the backport sheet, picked branches that were deleted, the file whose diff is open,
// and error toasts that can be read and copied.

import { expect, test } from "./fixtures";

test("a refused push always says why: git's words in the dialog, or a toast without an upstream", async ({ demo }) => {
  const { page } = demo;
  // With an upstream: the dialog, and git's own words under it.
  await demo.mutateQuietly(
    (d) => (d.rejectNextPush = " ! [remote rejected] main -> main (protected branch hook declined)"),
  );
  await page.locator(".topbar button", { hasText: "Push" }).click();
  await demo.confirmSync();
  const dialog = page.locator(".dialog", { hasText: "Push 거부됨" });
  await expect(dialog).toBeVisible();
  await dialog.getByText("git 출력 보기").click();
  await expect(dialog.locator("pre.raw")).toContainText("protected branch hook declined");
  await dialog.getByRole("button", { name: "취소" }).click();

  // No upstream yet (a first push the remote turned down): it used to say nothing at all.
  await page
    .locator(".sidebar li")
    .filter({ has: page.locator(".name").getByText("feature/login", { exact: true }) })
    .first()
    .dblclick();
  await expect.poll(async () => (await demo.snapshot()).head.branch).toBe("feature/login");
  await demo.mutateQuietly(
    (d) => (d.rejectNextPush = " ! [remote rejected] main -> main (protected branch hook declined)"),
  );
  await page.locator(".topbar button", { hasText: "Push" }).click();
  await demo.confirmSync();
  await demo.toast("protected branch hook declined");
});

test("error toasts stay while read, can be copied and closed", async ({ demo }) => {
  const { page } = demo;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await demo.mutateQuietly(
    (d) => (d.rejectNextPush = " ! [remote rejected] main -> main (protected branch hook declined)"),
  );
  await page
    .locator(".sidebar li")
    .filter({ has: page.locator(".name").getByText("feature/login", { exact: true }) })
    .first()
    .click({ button: "right" });
  await page
    .locator(".context-menu")
    .getByRole("menuitem", { name: /feature\/login 올리기/ })
    .click();
  const toast = page.locator(".toast.err").filter({ hasText: "protected branch hook declined" });
  await expect(toast).toBeVisible();
  await toast.hover();
  await page.waitForTimeout(7600);
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "복사" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("protected branch hook declined");
  await toast.getByRole("button", { name: "닫기" }).click();
  await expect(toast).toHaveCount(0);
});

test("the push dialog shows every commit when 'and N more' is clicked", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.grow(12));
  await expect.poll(async () => (await demo.snapshot()).head.ahead).toBeGreaterThan(8);
  const ahead = (await demo.snapshot()).head.ahead;
  await page.locator(".topbar button", { hasText: "Push" }).click();
  const ask = page.getByRole("dialog", { name: "Push" });
  await expect(ask.locator(".sync-commits code")).toHaveCount(8);
  await ask.getByRole("button", { name: `외 ${ahead - 8}개` }).click();
  await expect(ask.locator(".sync-commits code")).toHaveCount(ahead);
});

test("force pushes a branch from its menu after saying what the remote loses", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.commitOnRemote("origin/main", "Teammate: polish the minimap"));
  await expect.poll(async () => (await demo.snapshot()).refs.find((r) => r.name === "main")!.upstream?.behind).toBe(1);
  await page
    .locator(".sidebar li")
    .filter({ has: page.locator(".name").getByText("main", { exact: true }) })
    .first()
    .click({ button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: "강제 push (덮어쓰기)…" }).click();
  const dialog = page.getByRole("dialog", { name: "강제 push" });
  await expect(dialog).toContainText("origin/main에만 있는 커밋 1개가 사라져요");
  await expect(dialog).toContainText("--force-with-lease");
  await dialog.getByRole("button", { name: "덮어쓰기" }).click();
  await demo.toast("origin/main을 덮어썼어요");
  const snap = await demo.snapshot();
  expect(snap.refs.find((r) => r.name === "origin/main")!.target).toBe(
    snap.refs.find((r) => r.name === "main")!.target,
  );
});

test("the backport sheet fetches and compares again from its refresh button", async ({ demo }) => {
  const { page } = demo;
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 없는 커밋 보기");
  const sheet = page.locator(".backport-sheet");
  await expect(sheet.locator("tbody tr").first()).toBeVisible();
  await sheet.getByRole("button", { name: "새로고침 (모든 원격 Fetch)" }).click();
  await demo.toast("원격을 가져와 다시 비교했어요");
  await expect(sheet.locator("tbody tr").first()).toBeVisible();
});

test("a picked branch that is deleted stops counting", async ({ demo }) => {
  const { page } = demo;
  const side = page.locator(".app:not([hidden]) .sidebar");
  const branch = (name: string) =>
    side
      .locator("li")
      .filter({ has: page.locator(".name").getByText(name, { exact: true }) })
      .first();
  await branch("hotfix/crash").click();
  await branch("feature/theme").click();
  await expect(side.getByRole("button", { name: "선택 해제" })).toBeVisible();
  await branch("hotfix/crash").click({ button: "right" });
  await page.locator(".context-menu").getByText("브랜치 삭제…").click();
  await page.getByRole("dialog", { name: "브랜치 삭제" }).getByRole("button", { name: "삭제" }).click();
  await expect(branch("hotfix/crash")).toHaveCount(0);
  // One left: the clear-all button is for two or more.
  await expect(side.getByRole("button", { name: "선택 해제" })).toHaveCount(0);
  await expect(side.locator("li.focused")).toHaveCount(1);
});

test("the composer marks the file whose changes are open, as the diff sheet does", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const rows = page.locator(".composer .files li");
  await page.locator(".composer .path", { hasText: "renderer.ts" }).click();
  await expect(page.locator(".diff-sheet .file-list li.on")).toContainText("renderer.ts");
  await expect(rows.filter({ hasText: "renderer.ts" })).toHaveClass(/viewing/);
  await expect(page.locator(".composer .files li.viewing")).toHaveCount(1);
  // Picking another file in the sheet moves the mark in the composer too.
  const other = page.locator(".diff-sheet .file-list li").filter({ hasNotText: "renderer.ts" }).first();
  const name = (await other.locator(".path").textContent())!.trim();
  await other.click();
  await expect(rows.filter({ hasText: name })).toHaveClass(/viewing/);
  await expect(page.locator(".composer .files li.viewing")).toHaveCount(1);
});
