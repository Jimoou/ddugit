// Opening the repository and its files outside the app: file manager, default app,
// terminal, editor, diff and merge tools. The demo only records what would open.

import { expect, test, type Demo } from "./fixtures";

/** The file manager is named after the system the browser says it runs on. */
const REVEAL = /^(Finder|탐색기|파일 관리자)에서 보기$/;

const opened = (demo: Demo) => demo.page.evaluate(() => window.__ddugitDemo.opened);

/** Settings → External apps, on the editor chosen by name. */
async function chooseEditor(demo: Demo, label: string) {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByRole("tab", { name: "외부 프로그램" }).click();
  await dialog.getByLabel("파일 열 프로그램").selectOption({ label });
  return dialog;
}

test("settings: the editor is checked before it is kept, and the diff and merge tools", async ({ demo }) => {
  const { page } = demo;
  const dialog = await chooseEditor(demo, "Visual Studio Code");
  await expect(dialog.locator(".note")).toContainText("/usr/local/bin/code");
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!));
  expect(await stored()).toMatchObject({ editor: "code" });

  // A shell is no editor: refused, the last good one stays.
  await dialog.getByLabel("파일 열 프로그램").selectOption({ label: "직접 지정…" });
  const path = dialog.getByPlaceholder("편집기 실행 파일의 전체 경로");
  await path.fill("/bin/bash");
  await dialog.getByRole("button", { name: "확인하고 적용" }).click();
  await expect(dialog.locator(".note.warn")).toContainText("runs files");
  expect(await stored()).toMatchObject({ editor: "code" });
  await path.fill("/opt/editors/hx");
  await path.press("Enter");
  await expect(dialog.locator(".note")).toContainText("/opt/editors/hx");
  expect(await stored()).toMatchObject({ editor: "/opt/editors/hx" });

  // Tools: git's own setup first, then those defined in git config, then git's known ones.
  const diff = dialog.getByLabel("외부 비교 도구");
  await expect(diff.locator("option").first()).toHaveText("git 설정 따르기 (meld)");
  await expect(diff.locator("option").nth(1)).toHaveText("vscode");
  await diff.selectOption("kdiff3");
  await dialog.getByLabel("외부 병합 도구").selectOption("vscode");
  expect(await stored()).toMatchObject({ diffTool: "kdiff3", mergeTool: "vscode" });
});

const repoMenu = (demo: Demo) =>
  demo.page.locator(".topbar").getByRole("button", { name: "폴더·터미널·편집기에서 열기" }).click();

test("the repository opens in the file manager, a terminal and the diff tool", async ({ demo }) => {
  const menu = demo.page.locator(".context-menu");
  await repoMenu(demo);
  // No editor chosen: nothing to open the repository in yet.
  await expect(menu.getByRole("menuitem", { name: /에서 열기$/ })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: REVEAL }).click();
  await repoMenu(demo);
  await menu.getByRole("menuitem", { name: "여기서 터미널 열기" }).click();
  await repoMenu(demo);
  await menu.getByRole("menuitem", { name: "모든 변경을 비교 도구로 보기" }).click();
  await expect
    .poll(() => opened(demo))
    .toEqual([
      { what: "reveal", file: null },
      { what: "terminal", file: null },
      { what: "difftool:worktree", file: null },
    ]);
});

test("the repository opens in the editor chosen in the settings", async ({ demo }) => {
  await chooseEditor(demo, "Cursor");
  await demo.page.keyboard.press("Escape");
  await repoMenu(demo);
  await demo.page.locator(".context-menu").getByRole("menuitem", { name: "저장소를 Cursor에서 열기" }).click();
  await expect.poll(() => opened(demo)).toEqual([{ what: "editor", file: null, with: "cursor" }]);
});

test("a changed file opens in the diff tool or its app", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const row = page.locator(".composer .path", { hasText: "renderer.ts" });
  await row.click({ button: "right" });
  const menu = page.locator(".context-menu");
  await menu.getByRole("menuitem", { name: "비교 도구로 열기" }).click();
  await row.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "기본 앱으로 열기" }).click();
  // Nothing to compare for a new file yet.
  await page.locator(".composer .path", { hasText: "minimap.ts" }).click({ button: "right" });
  await expect(menu.getByRole("menuitem", { name: "비교 도구로 열기" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect
    .poll(() => opened(demo))
    .toEqual([
      { what: "difftool:worktree", file: "src/graph/renderer.ts" },
      { what: "default", file: "src/graph/renderer.ts" },
    ]);
});

test("a commit's file opens as that version, or in the diff tool against its parent", async ({ demo }) => {
  const { page } = demo;
  const menu = page.locator(".context-menu");
  const snap = await demo.snapshot();
  const id = snap.head.target!;
  const tip = (await demo.screenOf(id))!;
  await page.mouse.click(tip.x, tip.y);
  const file = page.locator(".inspector .changed li:not(.dir)").first();
  await file.click({ button: "right" });
  const path = (await menu.locator(".menu-title").textContent())!;
  await menu.getByRole("menuitem", { name: "이 버전 열기" }).click();
  await file.click({ button: "right" });
  await menu.getByRole("menuitem", { name: "비교 도구로 열기" }).click();

  await expect
    .poll(() => opened(demo))
    .toEqual([
      { what: "version", file: `${path}@${id.slice(0, 7)}` },
      { what: "difftool:commit", file: path },
    ]);
});

test("a conflicted file is resolved in the merge tool, and a tool that gives up says so", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => (d.conflictNext = true));
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 병합");
  await page.click(".dialog button.primary");
  const sheet = page.locator(".conflict-sheet");
  await expect(sheet.locator("header")).toContainText("남은 파일 2개");

  await demo.mutateQuietly((d) => (d.mergetoolFails = true));
  await sheet.getByRole("button", { name: "병합 도구로 열기" }).click();
  await demo.toast("병합 도구가 충돌을 해결하지 못했어요");
  await expect(sheet.locator("header")).toContainText("남은 파일 2개");

  await demo.mutateQuietly((d) => (d.mergetoolOpen = true));
  await sheet.getByRole("button", { name: "병합 도구로 열기" }).click();
  // While the tool is open the button says so.
  await expect(sheet.getByRole("button", { name: "병합 도구 사용 중…" })).toBeDisabled();
  await demo.mutateQuietly((d) => (d.mergetoolOpen = false));
  await demo.toast(/병합 도구로 .+ 해결했어요/);
  await expect(sheet.locator("header")).toContainText("남은 파일 1개");

  // The file list's menu opens a file outside the app.
  await sheet.locator(".file-list li").first().click({ button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: REVEAL }).click();
  const log = await opened(demo);
  expect(log.map((o) => o.what)).toEqual(["mergetool", "mergetool", "reveal"]);
});
