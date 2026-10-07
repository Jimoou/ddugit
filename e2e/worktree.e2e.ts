// The working tree: staging whole files, discarding hunks, ignoring and untracking, stash options,
// and commit options (hooks, sign-off, the commit template).

import { expect, test } from "./fixtures";

const RENDERER = "src/graph/renderer.ts";
const MINIMAP = "src/graph/minimap.ts";

test("stages a file from its menu, which switches the composer to the index, and stages or unstages all", async ({
  demo,
}) => {
  const { page } = demo;
  const change = async (path: string) => (await demo.snapshot()).changes.find((c) => c.path === path);
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const composer = page.locator(".composer");
  const stagedOnly = composer.getByLabel("스테이지된 변경만 커밋");
  await expect(stagedOnly).not.toBeChecked();

  await composer.locator(".files li", { hasText: RENDERER }).click({ button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: "스테이지", exact: true }).click();
  await demo.toast("스테이지했어요");
  expect(await change(RENDERER)).toMatchObject({ staged: "modified", unstaged: null });
  // Staging means committing the index: the checkboxes now stage and unstage.
  await expect(stagedOnly).toBeChecked();
  await expect(composer.locator(".files-head .muted")).toHaveText("2개 스테이지됨");

  // A row's checkbox unstages it; the header's stages everything.
  await composer.locator(".files li", { hasText: RENDERER }).locator("input").click();
  await demo.toast("스테이지에서 내렸어요");
  expect(await change(RENDERER)).toMatchObject({ staged: null, unstaged: "modified" });
  await composer.getByRole("checkbox", { name: "모두 스테이지", exact: true }).click();
  await expect.poll(async () => (await demo.snapshot()).changes.every((c) => c.staged && !c.unstaged)).toBe(true);
  expect(await change(MINIMAP)).toMatchObject({ staged: "added", unstaged: null });
  await composer.getByRole("checkbox", { name: "모두 스테이지에서 내리기" }).click();
  await expect.poll(async () => (await demo.snapshot()).changes.every((c) => !c.staged)).toBe(true);
  expect(await change(MINIMAP)).toMatchObject({ staged: null, unstaged: "untracked" });

  // The diff sheet stages a whole file, and everything in its tab.
  await composer.locator(".path", { hasText: RENDERER }).click();
  const sheet = page.locator(".diff-sheet");
  await expect(sheet.locator(".file-bar .path")).toHaveText(RENDERER);
  await sheet.getByRole("button", { name: "파일 스테이지" }).click();
  await demo.toast("스테이지했어요");
  expect(await change(RENDERER)).toMatchObject({ staged: "modified", unstaged: null });
  await sheet.getByRole("button", { name: "모두 스테이지" }).click();
  await expect.poll(async () => (await change(MINIMAP))?.staged).toBe("added");
  await sheet.getByRole("tab", { name: "스테이지됨" }).click();
  await sheet.getByRole("button", { name: "모두 내리기" }).click();
  await expect.poll(async () => (await demo.snapshot()).changes.every((c) => !c.staged)).toBe(true);
});

test("discards a hunk from the diff sheet after asking", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.locator(".composer .path", { hasText: RENDERER }).click();
  const sheet = page.locator(".diff-sheet");
  await expect(sheet.locator(".file-list li.on .path")).toHaveText(RENDERER);
  // Picked lines name the count.
  await sheet.locator("table.diff tr.ins td.sign").first().click();
  await expect(sheet.getByRole("button", { name: "선택한 1줄 버리기" })).toBeVisible();
  await sheet.locator("table.diff tr.ins td.sign").first().click();

  await sheet.getByRole("button", { name: "이 부분 버리기" }).click();
  const confirm = page.getByRole("dialog", { name: "변경 버리기" });
  await expect(confirm).toContainText(RENDERER);
  await expect(confirm).toContainText("되돌릴 수 없어요");
  await confirm.getByRole("button", { name: "취소" }).click();
  expect((await demo.snapshot()).changes.some((c) => c.path === RENDERER)).toBe(true);

  await sheet.getByRole("button", { name: "이 부분 버리기" }).click();
  await confirm.getByRole("button", { name: "버리기" }).click();
  await demo.toast("변경을 버렸어요");
  expect((await demo.snapshot()).changes.some((c) => c.path === RENDERER)).toBe(false);
});

test("ignores an untracked file's extension, and stops tracking a file after asking", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const composer = page.locator(".composer");
  const menu = page.locator(".context-menu");

  // A tracked file can't be ignored, only untracked.
  await composer.locator(".files li", { hasText: RENDERER }).click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "이 파일 무시" })).toBeDisabled();
  await expect(menu.getByRole("menuitem", { name: "추적 중지 (파일은 남김)" })).toBeEnabled();
  await page.keyboard.press("Escape");

  await composer.locator(".files li", { hasText: MINIMAP }).click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "src/graph/ 폴더 무시" })).toBeEnabled();
  await expect(menu.getByRole("menuitem", { name: /추적 중지/ }).first()).toBeDisabled();
  await menu.getByRole("menuitem", { name: "*.ts 파일 모두 무시" }).click();
  await demo.toast("*.ts를 .gitignore에 넣었어요");
  let snap = await demo.snapshot();
  expect(snap.changes.map((c) => c.path)).not.toContain(MINIMAP);
  expect(snap.changes.find((c) => c.path === ".gitignore")).toMatchObject({ unstaged: "untracked" });

  await composer.locator(".files li", { hasText: "README.md" }).click({ button: "right" });
  await menu.getByRole("menuitem", { name: "추적 중지하고 무시" }).click();
  const confirm = page.getByRole("dialog", { name: "추적 중지" });
  await expect(confirm).toContainText("README.md");
  await confirm.getByRole("button", { name: "추적 중지" }).click();
  await demo.toast("README.md 추적을 멈췄어요");
  snap = await demo.snapshot();
  expect(snap.changes.find((c) => c.path === "README.md")).toMatchObject({ staged: "deleted", unstaged: null });
});

test("stashes with options, and makes a branch from a stash in the sidebar", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const composer = page.locator(".composer");
  await composer.getByRole("button", { name: /스태시에 보관/ }).click();
  const save = page.getByRole("dialog", { name: "스태시에 보관" });
  await expect(save).toContainText("모든 변경을 보관");
  await save.getByLabel("메시지 (선택)").fill("keep the staged readme");
  await save.getByLabel("추적하지 않는 새 파일도 보관").uncheck();
  await save.getByLabel(/--keep-index/).check();
  await save.getByRole("button", { name: "보관", exact: true }).click();
  await demo.toast("스태시에 보관했어요");
  let snap = await demo.snapshot();
  // The untracked minimap stays, the staged README stays staged, the renderer edit is stashed.
  expect(snap.changes.map((c) => [c.path, c.staged, c.unstaged])).toEqual([
    [MINIMAP, null, "untracked"],
    ["README.md", "modified", null],
  ]);
  expect(snap.stashes[0].message).toContain("keep the staged readme");

  // The older stash was taken on main: a branch from it starts there and gets its change.
  const side = page.locator(".sidebar section", { has: page.locator("h3", { hasText: "스태시" }) });
  // `git stash branch` checks out the stash's base: clear what's left first.
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await composer.getByRole("button", { name: "선택 버리기" }).click();
  await page
    .getByRole("dialog", { name: "변경 버리기" })
    .getByRole("button", { name: /버리기/ })
    .click();
  await demo.toast("변경을 버렸어요");
  snap = await demo.snapshot();
  const main = snap.refs.find((r) => r.kind === "local" && r.name === "main")!.target;
  await side.locator("li", { hasText: "try warmer glow palette" }).click({ button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: "브랜치로 만들기…" }).click();
  const ask = page.getByRole("dialog", { name: "스태시로 브랜치 만들기" });
  await ask.getByPlaceholder("stash/my-idea").fill("warm-glow");
  await ask.getByRole("button", { name: "만들기" }).click();
  await demo.toast("warm-glow 브랜치에 스태시를 꺼냈어요");
  snap = await demo.snapshot();
  expect(snap.head.branch).toBe("warm-glow");
  expect(snap.head.target).toBe(main);
  expect(snap.changes.map((c) => c.path)).toEqual(["src/App.css"]);
  expect(snap.stashes.map((s) => s.message)).toEqual([expect.stringContaining("keep the staged readme")]);
});

test("commit options: the template fills the message, hooks can be skipped, and sign-off is added", async ({
  demo,
}) => {
  const { page } = demo;
  await demo.mutateQuietly((d) => {
    d.commitTemplate = "feat: \n\nRefs: #";
    d.preCommitFails = true;
  });
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const composer = page.locator(".composer");
  const message = composer.locator("textarea.message");
  await expect(message).toHaveValue("feat: \n\nRefs: #");
  const commit = composer.locator("button.primary");
  // The template as it is can't be committed.
  await expect(commit).toBeDisabled();
  await expect(composer.locator(".note")).toContainText("커밋 템플릿 그대로");

  await message.fill("feat: warmer glow\n\nRefs: #12");
  await commit.click();
  await expect(page.locator(".toast.err")).toContainText("pre-commit hook");
  const before = (await demo.snapshot()).head.target;

  await composer.getByLabel("훅 건너뛰기").check();
  await composer.getByLabel("Signed-off-by 붙이기").check();
  await commit.click();
  await demo.toast("커밋했어요");
  const snap = await demo.snapshot();
  expect(snap.head.target).not.toBe(before);
  expect(await page.evaluate(() => window.__ddugitDemo.lastMessage)).toBe(
    "feat: warmer glow\n\nRefs: #12\n\nSigned-off-by: Demo Pilot <pilot@ddugit.dev>",
  );
});
