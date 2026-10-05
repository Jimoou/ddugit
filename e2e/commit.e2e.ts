// Making commits: the composer, staging lines, editing past commits, identity and signatures.

import { expect, test } from "./fixtures";

test("adds a checkpoint from the + composer", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.fill("textarea.message", "Wire up minimap jump");
  await page.keyboard.press("Control+Enter");
  await demo.toast("커밋했어요");
  const snap = await demo.snapshot();
  const head = snap.commits.find((c) => c.id === snap.head.target)!;
  expect(head.summary).toBe("Wire up minimap jump");
  expect(snap.changes).toEqual([]);
});

test("stages single lines picked in the diff", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.locator(".composer .path").first().click();
  const signs = page.locator("table.diff tr.ins td.sign, table.diff tr.rem td.sign");
  await signs.nth(0).click();
  await signs.nth(2).click({ modifiers: ["Shift"] });
  await expect(page.locator("tr.picked")).toHaveCount(3);
  await expect(page.locator(".hunk-btn").first()).toHaveText(/^\s*선택한 3줄 스테이지$/);
  // Read the file before staging: the list refreshes (and may drop it) afterwards.
  const file = (await page.locator(".diff-sheet .file-list li.on .path").textContent())!;
  await page.locator(".hunk-btn").first().click();
  await demo.toast("스테이지했어요");
  expect((await demo.snapshot()).changes.find((c) => c.path === file)?.staged).toBeTruthy();
});

test("rewords and splits a past commit, and restores a file as of a commit", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.grow(3));
  let snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  const target = byId.get(snap.head.target!)!.parents[0];
  const later = byId.get(snap.head.target!)!.summary;

  // Reword the commit before HEAD; HEAD's commit is replayed on top.
  await expect.poll(async () => (await demo.screenOf(target)) !== null).toBe(true);
  const at = (await demo.screenOf(target))!;
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.click(".context-menu >> text=메시지 고치기…");
  const dialog = page.getByRole("dialog", { name: "메시지 고치기" });
  await dialog.getByLabel("커밋 메시지").fill("Better words");
  await dialog.getByRole("button", { name: "적용" }).click();
  await demo.toast("메시지를 고쳤어요");
  snap = await demo.snapshot();
  const head = snap.commits.find((c) => c.id === snap.head.target)!;
  expect(head.summary).toBe(later);
  expect(snap.commits.find((c) => c.id === head.parents[0])!.summary).toBe("Better words");

  // Split the reworded commit by files (the demo shows a few files per commit).
  const reworded = head.parents[0];
  await expect.poll(async () => (await demo.screenOf(reworded)) !== null).toBe(true);
  const at2 = (await demo.screenOf(reworded))!;
  await page.mouse.click(at2.x, at2.y, { button: "right" });
  await page.click(".context-menu >> text=커밋 나누기…");
  const split = page.getByRole("dialog", { name: "커밋 나누기" });
  await split.locator(".split-files input").first().check();
  await split.getByRole("button", { name: "적용" }).click();
  await demo.toast("커밋을 둘로 나눴어요");
  expect((await demo.snapshot()).commits.length).toBe(snap.commits.length + 1);

  // Restore one of HEAD's files as it was before HEAD.
  const now = await demo.snapshot();
  const tip = (await demo.screenOf(now.head.target!))!;
  await page.mouse.click(tip.x, tip.y);
  const file = page.locator(".inspector .changed li:not(.dir)").first();
  await file.click({ button: "right" });
  await page.click(".context-menu >> text=이 커밋 이전 상태로");
  await expect(page.locator(".toast").filter({ hasText: "복원했어요" })).toBeVisible();
  expect((await demo.snapshot()).changes.some((c) => c.staged)).toBe(true);
});

test("identity: a profile made in settings is applied to the repository from the composer", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByRole("tab", { name: "프로필" }).click();
  const profiles = dialog.locator("section.profiles");
  await expect(profiles.locator(".global-identity")).toContainText("Demo Pilot <pilot@ddugit.dev>");
  // First use: offered to start from the global identity.
  await expect(profiles.locator(".offer")).toContainText("첫 프로필");

  await profiles.getByRole("button", { name: "+ 프로필 추가" }).click();
  await profiles.getByPlaceholder("you@example.com").fill("kim.corp.example");
  await profiles.getByPlaceholder("Hong Gildong").fill("Kim Work");
  await profiles.getByRole("button", { name: "저장", exact: true }).click();
  await expect(profiles.locator(".note.warn")).toHaveText("이메일 형식이 아니에요");
  await profiles.getByPlaceholder("you@example.com").fill("kim@corp.example");
  await profiles.locator(".profile-form select").selectOption("ssh");
  await profiles.getByPlaceholder(/공개 키 경로/).fill("/home/pilot/.ssh/id_ed25519.pub");
  await profiles.getByRole("button", { name: "저장", exact: true }).click();
  await expect(profiles.locator(".profile-list li")).toContainText("Kim Work <kim@corp.example>");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!).profiles)).toEqual([
    { name: "Kim Work", email: "kim@corp.example", signing: { format: "ssh", key: "/home/pilot/.ssh/id_ed25519.pub" } },
  ]);
  await dialog.getByRole("button", { name: "닫기" }).click();

  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const line = page.locator(".composer .identity-line");
  await expect(line.locator(".who")).toHaveText("Demo Pilot <pilot@ddugit.dev>");
  await expect(line.locator(".scope")).toHaveText("전역");
  await line.getByRole("button", { name: "커밋할 사람 바꾸기" }).click();
  await page
    .locator(".context-menu")
    .getByRole("menuitem", { name: /Kim Work/ })
    .click();
  await demo.toast("이 저장소는 Kim Work로 커밋해요");
  await expect(line.locator(".who")).toHaveText("Kim Work <kim@corp.example>");
  await expect(line.locator(".scope")).toHaveText("이 저장소");
  await expect(line.locator(".signs")).toBeVisible();

  // Commits made now are signed, and the inspector says so.
  await page.fill("textarea.message", "Signed by the work profile");
  await page.keyboard.press("Control+Enter");
  await demo.toast("커밋했어요");
  const head = (await demo.snapshot()).head.target!;
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y);
  await expect(page.locator(".inspector .signature")).toHaveText("서명됨");

  // Back to the global identity.
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await line.getByRole("button", { name: "커밋할 사람 바꾸기" }).click();
  await page.locator(".context-menu").getByRole("menuitem", { name: "전역 설정 따르기" }).click();
  await expect(line.locator(".who")).toHaveText("Demo Pilot <pilot@ddugit.dev>");
  await expect(line.locator(".signs")).toHaveCount(0);
});

test("inspector: shows whether a commit is signed", async ({ demo }) => {
  const { page } = demo;
  const head = (await demo.snapshot()).head.target!;
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y);
  const sig = page.locator(".inspector .signature");
  await expect(sig).toHaveText("서명됨");
  await expect(sig).toHaveAttribute("title", /Jimin <jimin@ddugit.dev>/);
  await page.locator(".inspector .sha.parent").first().click();
  await expect(page.locator(".inspector h2")).toHaveText("Minimap");
  await expect(sig).toHaveText("서명됨 (확인 안 됨)");
  await page.locator(".inspector .sha.parent").first().click();
  await expect(page.locator(".inspector h2")).toHaveText("Semantic zoom levels");
  await expect(sig).toHaveCount(0);
});
