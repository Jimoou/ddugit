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

test("tags a commit and deletes the tag from the sidebar", async ({ demo }) => {
  const { page } = demo;
  const head = (await demo.snapshot()).head.target!;
  await (await demo.commitMenu(head)).getByText("여기에 태그…").click();
  const dialog = page.getByRole("dialog", { name: `${head.slice(0, 7)}에 태그` });
  await dialog.getByPlaceholder("v1.0.0").fill("v0.3.0");
  await dialog.getByPlaceholder(/주석 태그/).fill("Zoom release");
  await dialog.getByRole("button", { name: "태그 만들기" }).click();
  await demo.toast("v0.3.0 태그를 만들었어요");
  expect((await demo.snapshot()).refs.find((r) => r.kind === "tag" && r.name === "v0.3.0")?.target).toBe(head);
  const tags = page.locator(".sidebar section", { has: page.locator("h3", { hasText: "태그" }) });
  await expect(tags.locator("li")).toHaveCount(3);

  await tags.locator("li", { hasText: "v0.3.0" }).click({ button: "right" });
  await page.locator(".context-menu").getByText("태그 삭제").click();
  const confirm = page.getByRole("dialog", { name: "태그 삭제" });
  await expect(confirm).toContainText("로컬 태그 v0.3.0");
  await confirm.getByRole("button", { name: "삭제" }).click();
  await demo.toast("v0.3.0 태그를 지웠어요");
  await expect(tags.locator("li")).toHaveCount(2);
  expect((await demo.snapshot()).refs.some((r) => r.name === "v0.3.0")).toBe(false);
});

test("renames a branch, and deleting an unmerged one asks a second time", async ({ demo }) => {
  const { page } = demo;
  const local = page.locator(".sidebar section", { has: page.locator("h3", { hasText: "브랜치" }) }).first();
  const row = (name: string) =>
    local.locator("li").filter({ has: page.locator(".name").getByText(name, { exact: true }) });
  const branches = async () => (await demo.snapshot()).refs.filter((r) => r.kind === "local").map((r) => r.name);
  const theme = (await demo.snapshot()).refs.find((r) => r.name === "feature/theme")!.target;

  await row("feature/theme").click({ button: "right" });
  await page.locator(".context-menu").getByText("이름 바꾸기…").click();
  const rename = page.getByRole("dialog", { name: "브랜치 이름 바꾸기" });
  const name = rename.locator("input.text");
  await expect(name).toHaveValue("feature/theme");
  // The old name can't be "renamed" to itself.
  await expect(rename.getByRole("button", { name: "바꾸기" })).toBeDisabled();
  await name.fill("feature/warm theme");
  await expect(name).toHaveValue("feature/warm-theme");
  await rename.getByRole("button", { name: "바꾸기" }).click();
  await demo.toast(/feature\/warm-theme.* 이름을 바꿨어요/);
  expect(await branches()).toContain("feature/warm-theme");
  expect(await branches()).not.toContain("feature/theme");
  expect((await demo.snapshot()).refs.find((r) => r.name === "feature/warm-theme")!.target).toBe(theme);

  // A merged branch goes after one confirmation.
  await row("hotfix/crash").click({ button: "right" });
  await page.locator(".context-menu").getByText("브랜치 삭제…").click();
  await page.getByRole("dialog", { name: "브랜치 삭제" }).getByRole("button", { name: "삭제" }).click();
  await demo.toast("hotfix/crash 브랜치를 지웠어요");
  expect(await branches()).not.toContain("hotfix/crash");

  // An unmerged one asks again; cancelling there keeps it.
  const deleteWarm = async () => {
    await row("feature/warm-theme").click({ button: "right" });
    await page.locator(".context-menu").getByText("브랜치 삭제…").click();
    await page.getByRole("dialog", { name: "브랜치 삭제" }).getByRole("button", { name: "삭제" }).click();
  };
  const again = page.getByRole("dialog", { name: "병합되지 않은 브랜치" });
  await deleteWarm();
  await expect(again).toContainText("feature/warm-theme");
  await again.getByRole("button", { name: "취소" }).click();
  await expect(again).toHaveCount(0);
  expect(await branches()).toContain("feature/warm-theme");
  await deleteWarm();
  await again.getByRole("button", { name: "그래도 삭제" }).click();
  await demo.toast("feature/warm-theme 브랜치를 지웠어요");
  expect(await branches()).not.toContain("feature/warm-theme");
});

test("removing a worktree with changes left in it asks again before deleting them", async ({ demo }) => {
  const { page } = demo;
  const section = page.locator(".app:not([hidden]) .sidebar .worktrees");
  await section.getByRole("button", { name: "워크트리 추가" }).click();
  const dialog = page.locator(".worktree-dialog");
  await dialog.getByRole("radio", { name: "새 브랜치" }).click();
  await dialog.getByLabel("새 브랜치").fill("dirty-work");
  // The demo treats a folder named "dirty" as one with uncommitted changes.
  await expect(dialog.getByLabel("워크트리 폴더")).toHaveValue("/demo/ddugit-demo-dirty-work");
  await dialog.getByRole("button", { name: "추가하고 탭으로 열기" }).click();
  await demo.toast("dirty-work를 새 워크트리에 체크아웃했어요");
  await page.locator(".tabbar .tab:not(.tab-home)").nth(0).click();
  const row = section.locator("li").filter({ hasText: "ddugit-demo-dirty-work" });
  const remove = async () => {
    await row.click({ button: "right" });
    await page.getByRole("menuitem", { name: "워크트리 제거…" }).click();
    await page.getByRole("dialog", { name: "워크트리 제거" }).getByRole("button", { name: "제거" }).click();
  };

  const again = page.getByRole("dialog", { name: "변경이 남은 워크트리" });
  await remove();
  await expect(again).toContainText("/demo/ddugit-demo-dirty-work에 커밋하지 않은 변경이 있어요");
  await again.getByRole("button", { name: "취소" }).click();
  await expect(row).toHaveCount(1);
  await remove();
  await again.getByRole("button", { name: "변경까지 지우기" }).click();
  await demo.toast("워크트리를 제거했어요");
  await expect(row).toHaveCount(0);
  // The branch stays.
  expect((await demo.snapshot()).refs.some((r) => r.name === "dirty-work")).toBe(true);
});

test("a submodule's menu updates it (saying when it needs sign-in), copies its URL and syncs", async ({ demo }) => {
  const { page } = demo;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  const section = page.locator(".app:not([hidden]) .sidebar .submodules");
  const math = section.locator("li").filter({ hasText: "libs/orbit-math" });
  const stardust = section.locator("li").filter({ hasText: "vendor/stardust" });
  const menu = async (row: typeof math, item: string) => {
    await row.click({ button: "right" });
    await page.locator(".context-menu").getByRole("menuitem", { name: item }).click();
  };

  // Its remote refuses the first time: say so, and leave it as it was.
  await demo.mutateQuietly((d) => (d.failNextRemote = "https"));
  await menu(math, "기록된 커밋으로 업데이트");
  await demo.toast("서브모듈을 받으려면 인증이 필요해요. 원격 인증을 먼저 설정하세요");
  await expect(math).toContainText("초기화 안 됨");
  await menu(math, "기록된 커밋으로 업데이트");
  await demo.toast("서브모듈을 기록된 커밋으로 맞췄어요");
  await expect(math).toContainText("최신");

  // Up to date already: nothing to update.
  await stardust.click({ button: "right" });
  await expect(
    page.locator(".context-menu").getByRole("menuitem", { name: "기록된 커밋으로 업데이트" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await menu(stardust, "URL 복사");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toBe("https://github.com/ddugit/stardust.git");
  await menu(stardust, "URL 다시 맞추기 (sync)");
  await demo.toast("서브모듈 URL을 .gitmodules에 맞췄어요");
});

test("LFS: turns LFS on for the repository, untracks a pattern, and says when git-lfs is missing", async ({ demo }) => {
  const { page } = demo;
  const section = page.locator(".app:not([hidden]) .sidebar .lfs");
  // LFS is read again when HEAD moves (or after an LFS command): move it along with the switch.
  await demo.mutate((d) => {
    d.lfs = "off";
    d.grow(1);
  });
  await expect(section).toContainText("이 저장소에서 LFS가 꺼져 있어요");
  await section.getByRole("button", { name: "LFS 켜기" }).click();
  await demo.toast("이 저장소에서 LFS를 켰어요");
  await expect(section).not.toContainText("LFS가 꺼져 있어요");

  // Downloading needs the remote: a refused sign-in says so and leaves the files as pointers.
  await demo.mutateQuietly((d) => (d.failNextRemote = "https"));
  await section.getByRole("button", { name: "받기" }).click();
  await demo.toast("LFS 파일을 받으려면 원격 인증이 필요해요");
  await expect(section).toContainText("받지 않은 파일 3개");

  await section.getByRole("button", { name: "추적 해제 *.psd" }).click();
  await demo.toast("*.psd를 LFS에서 뺐어요. 바뀐 .gitattributes를 커밋하세요");
  await expect(section).not.toContainText("*.psd");
  expect((await demo.snapshot()).changes.some((c) => c.path === ".gitattributes")).toBe(true);

  // Without git-lfs: the patterns stay listed, the actions go, and the install guide is offered.
  await demo.mutate((d) => {
    d.lfs = "missing";
    d.grow(1);
  });
  await expect(section).toContainText("git-lfs가 설치되어 있지 않아서 큰 파일이 포인터로만 보여요");
  await expect(section.getByRole("button", { name: "git-lfs 설치 안내" })).toBeVisible();
  await expect(section.getByRole("button", { name: "LFS로 관리할 파일 형식 추가" })).toHaveCount(0);
  await expect(section.getByRole("button", { name: /추적 해제/ })).toHaveCount(0);
  await expect(section.getByRole("button", { name: "받기" })).toBeDisabled();
});
