import { expect, test } from "./fixtures";

test("creates a pull request from a branch menu, pushing the branch first", async ({ demo }) => {
  const { page } = demo;
  const section = page.locator(".sidebar section.pulls");
  const open = section.locator(":scope > ul > li");
  await expect(open).toHaveCount(2);

  // feature/graph-zoom has a commit origin lacks.
  await page.locator(".sidebar li", { hasText: "feature/graph-zoom" }).first().click({ button: "right" });
  await page.click(".context-menu >> text=PR 만들기…");
  const dialog = page.getByRole("dialog", { name: "PR 만들기" });
  await expect(dialog.getByLabel("보낼 브랜치")).toHaveValue("feature/graph-zoom");
  await expect(dialog.getByLabel("받을 브랜치")).toHaveValue("main");
  // Three commits main lacks: the title comes from the branch, the body lists them oldest first.
  await expect(dialog.locator(".pr-commits")).toContainText("커밋 3개");
  await expect(dialog.getByLabel("제목")).toHaveValue("Graph zoom");
  await expect(dialog.getByLabel("설명")).toHaveValue("- Semantic zoom levels\n- Minimap\n- Zoom to cursor");
  await expect(dialog.locator(".note.warn")).toContainText("안 올린 커밋이 1개");

  await dialog.getByLabel("제목").fill("Zoom the graph");
  await dialog.getByLabel("초안으로 만들기").check();
  await dialog.getByRole("button", { name: "올리고 PR 만들기" }).click();
  await demo.toast("PR #16을 만들었어요");
  await expect(dialog).toHaveCount(0);
  const snap = await demo.snapshot();
  expect(snap.refs.find((r) => r.name === "origin/feature/graph-zoom")!.target).toBe(snap.head.target);
  // It joins the list (and the graph) as a draft.
  await expect(open).toHaveCount(3);
  await expect(open.filter({ hasText: "#16" })).toContainText("Zoom the graph");
  await expect(open.filter({ hasText: "#16" })).toContainText("초안");
  await expect(page.locator(".toast button", { hasText: "열기" })).toBeVisible();

  // From the section header, the current branch again: the forge says one is open already.
  await section.getByRole("button", { name: "PR 만들기" }).click();
  await expect(dialog.getByLabel("보낼 브랜치")).toHaveValue("feature/graph-zoom");
  await dialog.getByRole("button", { name: "PR 만들기" }).click();
  await expect(dialog.locator(".pr-problem")).toContainText("이 브랜치의 PR #16이 이미 열려 있어요");
  await dialog.getByRole("button", { name: "취소" }).click();
  await expect(dialog).toHaveCount(0);
});

test("creating a pull request asks for a token first, and offers Pro on Free", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => (d.forgeToken = "none"));
  await page.locator(".sidebar li", { hasText: "feature/theme" }).first().click({ button: "right" });
  await page.click(".context-menu >> text=PR 만들기…");
  const dialog = page.getByRole("dialog", { name: "PR 만들기" });
  await expect(dialog).toContainText("GitHub에 연결해야 PR을 만들 수 있어요");
  await expect(dialog.getByRole("button", { name: "PR 만들기" })).toBeDisabled();
  await dialog.getByRole("button", { name: "GitHub 연결" }).click();
  const token = page.getByRole("dialog", { name: "GitHub 연결" });
  await token.getByLabel("토큰").fill("ghp_demo");
  await token.getByLabel("토큰").press("Enter");
  await demo.toast("GitHub에 연결했어요");
  // Connected, the dialog reads the forge again and can go on.
  await expect(dialog.getByRole("button", { name: "PR 만들기" })).toBeEnabled();
  await dialog.getByRole("button", { name: "취소" }).click();

  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__ddugitDemoPro = { pro: false, source: "free" };
  });
  await page.reload();
  await page.locator(".sidebar li", { hasText: "feature/theme" }).first().click({ button: "right" });
  await page.click(".context-menu >> text=PR 만들기…");
  await expect(dialog.locator(".pr-locked")).toContainText("Pro 기능");
  await expect(dialog.getByRole("button", { name: "PR 만들기" })).toBeDisabled();
  await dialog.locator(".pr-locked button").click();
  await expect(page.locator(".dialog.pro-offer")).toContainText("비공개 저장소와 회사 서버의 PR");
});
