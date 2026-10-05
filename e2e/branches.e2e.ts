// Branches and the sidebar: switching, cleanup, worktrees, submodules, LFS and making local branches.

import { expect, test } from "./fixtures";

test("switches branch from the top bar and re-reads the repository with Cmd/Ctrl+R", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar .branch-now").click();
  const menu = page.locator(".context-menu");
  await expect(menu).toContainText("브랜치 바꾸기");
  await menu.getByRole("menuitem", { name: "feature/theme" }).click();
  await expect.poll(async () => (await demo.snapshot()).head.branch).toBe("feature/theme");
  await expect(page.locator(".topbar .branch-now")).toContainText("feature/theme");

  // A commit made outside the app shows up on Cmd/Ctrl+R.
  await demo.mutateQuietly((d) => d.grow(1));
  const tip = (await demo.snapshot()).head.target!;
  const drawn = () => page.evaluate((id) => window.__ddugit.screenOf(id), tip);
  expect(await drawn()).toBeNull();
  await page.keyboard.press("Control+r");
  await expect.poll(drawn).not.toBeNull();
});

test("folds sidebar sections and the whole sidebar, and keeps the layout", async ({ demo }) => {
  const { page } = demo;
  const side = page.locator(".sidebar");
  const tags = side.locator("section", { has: page.locator("h3", { hasText: "태그" }) });
  await expect(tags.locator("li")).toHaveCount(2);
  await tags.locator("h3 .fold").click();
  await expect(tags.locator("li")).toHaveCount(0);
  await expect(tags.locator("h3 .fold")).toHaveAttribute("aria-expanded", "false");

  // Folded to a rail; a section's icon unfolds the sidebar with that section open.
  await side.getByLabel("사이드바 접기 (⌘/Ctrl+B)").click();
  await expect(page.locator(".sidebar.rail")).toBeVisible();
  await page.reload();
  await expect(page.locator(".sidebar.rail")).toBeVisible();
  await page.locator(".sidebar.rail").getByLabel("태그").click();
  await expect(page.locator(".sidebar.rail")).toHaveCount(0);
  await expect(tags.locator("li")).toHaveCount(2);

  // ⌘/Ctrl+B folds it again.
  await page.keyboard.press("Control+b");
  await expect(page.locator(".sidebar.rail")).toBeVisible();
});

test("cleans up merged and gone branches from the sidebar", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => {
    d.goneBranches = ["feature/theme"];
  });
  await demo.branchTool("브랜치 정리…");
  const sheet = page.locator(".cleanup-sheet");
  await expect(sheet).toContainText("병합 완료");
  await expect(sheet).toContainText("원격에서 사라짐");
  // Merged ones start selected; also pick the one whose remote branch is gone.
  const merged = await sheet.locator(".clean-group").first().locator("li").count();
  await sheet.getByRole("checkbox", { name: "feature/theme" }).check();
  await sheet.getByRole("button", { name: `선택한 ${merged + 1}개 삭제` }).click();
  await page.getByRole("button", { name: "그래도 삭제" }).click();
  await demo.toast(`브랜치 ${merged + 1}개를 정리했어요`);
  const names = (await demo.snapshot()).refs.filter((r) => r.kind === "local").map((r) => r.name);
  expect(names).not.toContain("feature/theme");
  expect(names).not.toContain("feature/login");
});

test("adds a worktree for a new branch, opens it in a tab, and removes it", async ({ demo }) => {
  const { page } = demo;
  const section = page.locator(".app:not([hidden]) .sidebar .worktrees");
  await expect(section.locator("li")).toHaveCount(1);
  await section.getByRole("button", { name: "워크트리 추가" }).click();
  const dialog = page.locator(".worktree-dialog");
  await dialog.getByRole("radio", { name: "새 브랜치" }).click();
  await dialog.getByLabel("새 브랜치").fill("hotfix");
  await expect(dialog.getByLabel("워크트리 폴더")).toHaveValue("/demo/ddugit-demo-hotfix");
  await dialog.getByRole("button", { name: "추가하고 탭으로 열기" }).click();
  await demo.toast("hotfix를 새 워크트리에 체크아웃했어요");
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(2);

  // Back in the first tab: the branch is out elsewhere, so checking it out opens that tab.
  await page.locator(".tabbar .tab:not(.tab-home)").nth(0).click();
  await expect(section.locator("li")).toHaveCount(2);
  const branch = page.locator(".app:not([hidden]) .sidebar li").filter({ hasText: /^hotfix$/ });
  await expect(branch.locator(".elsewhere")).toBeVisible();
  await branch.dblclick();
  await demo.toast(/다른 워크트리에 체크아웃돼 있어서/);
  await expect(page.locator(".tab.on")).toHaveCount(1);
  await expect(page.locator(".tabbar .tab:not(.tab-home)").nth(1)).toHaveClass(/on/);

  await page.locator(".tabbar .tab:not(.tab-home)").nth(0).click();
  await section.locator("li").filter({ hasText: "ddugit-demo-hotfix" }).click({ button: "right" });
  await page.getByRole("menuitem", { name: "워크트리 제거…" }).click();
  await page.locator(".dialog").getByRole("button", { name: "제거" }).click();
  await demo.toast("워크트리를 제거했어요");
  await expect(section.locator("li")).toHaveCount(1);
});

test("lists submodules with their state, updates them, and opens one in a tab", async ({ demo }) => {
  const { page } = demo;
  const section = page.locator(".app:not([hidden]) .sidebar .submodules");
  const math = section.locator("li").filter({ hasText: "libs/orbit-math" });
  await expect(math).toContainText("초기화 안 됨");
  await section.getByRole("button", { name: /모두 업데이트/ }).click();
  await demo.toast("서브모듈을 기록된 커밋으로 맞췄어요");
  await expect(math).toContainText("최신");
  await section.locator("li").filter({ hasText: "vendor/stardust" }).click();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(2);
});

test("LFS: downloads files left as pointers and tracks a new file type", async ({ demo }) => {
  const { page } = demo;
  const section = page.locator(".app:not([hidden]) .sidebar .lfs");
  await expect(section).toContainText("*.psd");
  await expect(section).toContainText("받지 않은 파일 3개");
  await section.getByRole("button", { name: "받기" }).click();
  await demo.toast("LFS 파일을 받았어요");
  await expect(section).not.toContainText("받지 않은 파일");

  await section.getByRole("button", { name: "LFS로 관리할 파일 형식 추가" }).click();
  await page.locator(".dialog input.text").fill("*.mp4");
  await page.locator(".dialog").getByRole("button", { name: "추적" }).click();
  await demo.toast(/\*\.mp4를 LFS로 관리해요/);
  await expect(section.locator("li")).toHaveCount(3);
  expect((await demo.snapshot()).changes.some((c) => c.path === ".gitattributes")).toBe(true);
});

test("makes local branches: from a remote-only branch, a new one at HEAD, and under another name", async ({ demo }) => {
  const { page } = demo;
  // The branch switcher lists the remote-only branch; picking it makes it local and tracking.
  await page.locator(".topbar .branch-now").click();
  await page.getByRole("menuitem", { name: /origin\/feature\/orbit-sync/ }).click();
  await demo.toast("origin/feature/orbit-sync를 로컬로 가져와 이동했어요");
  expect((await demo.snapshot()).head.branch).toBe("feature/orbit-sync");

  // New branch from the sidebar's +.
  await page.locator(".app:not([hidden]) .sidebar").getByRole("button", { name: "새 브랜치…" }).click();
  await page.locator(".dialog input.text").fill("spike/idea");
  await page.locator(".dialog").getByRole("button", { name: "만들고 이동" }).click();
  await demo.toast("spike/idea 브랜치를 만들었어요");
  expect((await demo.snapshot()).head.branch).toBe("spike/idea");

  // origin/main while our main has moved on: follow it under a new name instead of switching.
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  await page
    .locator(".app:not([hidden]) .sidebar section.remote-sub")
    .filter({ hasText: "origin" })
    .locator("li")
    .filter({ hasText: /^main$/ })
    .dblclick();
  const name = page.locator(".dialog input.text");
  await expect(name).toHaveValue("origin-main");
  await page.locator(".dialog").getByRole("button", { name: "만들고 이동" }).click();
  await demo.toast("origin/main을 로컬로 가져와 이동했어요");
  expect((await demo.snapshot()).head.branch).toBe("origin-main");
});
