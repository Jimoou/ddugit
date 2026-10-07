// A branch and its remotes: what it tracks, pushing and fast-forwarding it without checking it out,
// renaming it there too, renaming and moving a remote, and resetting onto another line.

import { type Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const localRow = (page: Page, name: string) =>
  page
    .locator(".sidebar section", { has: page.locator("h3", { hasText: "브랜치" }) })
    .first()
    .locator("li")
    .filter({ has: page.locator(".name").getByText(name, { exact: true }) });

/** Pick `item` in local branch `name`'s menu. */
async function branchMenu(page: Page, name: string, item: string | RegExp) {
  await localRow(page, name).click({ button: "right" });
  await page.locator(".context-menu").getByRole("menuitem", { name: item }).click();
}

test("stops tracking a remote branch, then picks one again (the same name first)", async ({ demo }) => {
  const { page } = demo;
  const upstreamOf = async (name: string) =>
    (await demo.snapshot()).refs.find((r) => r.kind === "local" && r.name === name)!.upstream?.name;
  expect(await upstreamOf("feature/theme")).toBe("origin/feature/theme");

  await branchMenu(page, "feature/theme", "origin/feature/theme 따라가기 그만두기");
  await demo.toast(/feature\/theme.? 이제 원격 브랜치를 따라가지 않아요/);
  expect(await upstreamOf("feature/theme")).toBeUndefined();

  await branchMenu(page, "feature/theme", "따라갈 원격 브랜치 정하기…");
  const pick = page.locator(".context-menu");
  await expect(pick.locator(".menu-title")).toHaveText(/^feature\/theme.? 따라갈 원격 브랜치$/);
  const first = pick.getByRole("menuitem").first();
  await expect(first).toContainText("origin/feature/theme");
  await expect(first).toContainText("같은 이름");
  await first.click();
  await demo.toast(/feature\/theme.? 이제 origin\/feature\/theme.? 따라가요/);
  expect(await upstreamOf("feature/theme")).toBe("origin/feature/theme");
});

test("fast-forwards and pushes branches that aren't checked out", async ({ demo }) => {
  const { page } = demo;
  const tip = async (name: string) => (await demo.snapshot()).refs.find((r) => r.name === name)!.target;
  // A teammate pushed to main while we work on another branch.
  await demo.mutate((d) => d.commitOnRemote("origin/main", "Teammate: polish the minimap"));
  await expect.poll(async () => (await demo.snapshot()).refs.find((r) => r.name === "main")!.upstream?.behind).toBe(1);
  await branchMenu(page, "main", "origin/main으로 빨리 감기");
  await demo.toast("main을 origin/main으로 빨리 감았어요");
  expect(await tip("main")).toBe(await tip("origin/main"));
  expect((await demo.snapshot()).head.branch).toBe("feature/graph-zoom");

  // Up to date now; once both sides have their own commits, it says why it can't.
  await localRow(page, "main").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /origin\/main으로 빨리 감기/ })).toBeDisabled();
  await expect(page.getByRole("menuitem", { name: /origin\/main으로 빨리 감기/ })).toContainText("최신이에요");
  await page.keyboard.press("Escape");
  await demo.mutate((d) => {
    d.commitOn("main", "Local hotfix");
    d.commitOnRemote("origin/main", "Teammate: another fix");
  });
  await expect.poll(async () => (await demo.snapshot()).refs.find((r) => r.name === "main")!.upstream?.ahead).toBe(1);
  await localRow(page, "main").click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /origin\/main으로 빨리 감기/ })).toContainText("갈라져서 안 돼요");
  await page.keyboard.press("Escape");

  // A branch with no upstream goes up to origin and follows it there.
  await branchMenu(page, "feature/login", /feature\/login 올리기 \(Push\)/);
  await demo.toast("feature/login을 origin에 올렸어요");
  const snap = await demo.snapshot();
  expect(snap.refs.find((r) => r.name === "origin/feature/login")!.target).toBe(await tip("feature/login"));
  expect(snap.refs.find((r) => r.name === "feature/login")!.upstream?.name).toBe("origin/feature/login");
});

test("renames a branch on its remote too", async ({ demo }) => {
  const { page } = demo;
  const theme = (await demo.snapshot()).refs.find((r) => r.name === "feature/theme")!.target;
  await branchMenu(page, "feature/theme", "이름 바꾸기…");
  const rename = page.getByRole("dialog", { name: "브랜치 이름 바꾸기" });
  await rename.locator("input.text").fill("feature/glow");
  await rename.getByRole("checkbox", { name: "origin에서도 이름 바꾸기" }).check();
  await rename.getByRole("button", { name: "바꾸기" }).click();
  await demo.toast("origin에서도 feature/glow로 바꿨어요");
  const snap = await demo.snapshot();
  const names = snap.refs.map((r) => r.name);
  expect(names).toContain("origin/feature/glow");
  expect(names).not.toContain("origin/feature/theme");
  expect(names).not.toContain("feature/theme");
  const glow = snap.refs.find((r) => r.kind === "local" && r.name === "feature/glow")!;
  expect(glow.target).toBe(theme);
  expect(glow.upstream?.name).toBe("origin/feature/glow");
});

test("a branch following a remote branch of another name is renamed only here", async ({ demo }) => {
  const { page } = demo;
  await branchMenu(page, "feature/login", "따라갈 원격 브랜치 정하기…");
  await page
    .locator(".context-menu")
    .getByRole("menuitem", { name: /^origin\/main/ })
    .click();
  await demo.toast(/feature\/login.? 이제 origin\/main.? 따라가요/);
  await branchMenu(page, "feature/login", "이름 바꾸기…");
  const rename = page.getByRole("dialog", { name: "브랜치 이름 바꾸기" });
  // Renaming "there" would delete origin/main.
  await expect(rename.getByRole("checkbox")).toHaveCount(0);
});

test("renames a remote and changes its URL", async ({ demo }) => {
  const { page } = demo;
  const origin = page.locator(".sidebar section.remote-sub").filter({ hasText: "origin" });
  const menu = async (remote: string, item: string) => {
    await page
      .locator(".sidebar")
      .getByRole("button", { name: `${remote} 메뉴` })
      .click();
    await page.locator(".context-menu").getByRole("menuitem", { name: item }).click();
  };
  await expect(origin).toBeVisible();
  await menu("origin", "이름 바꾸기…");
  const rename = page.getByRole("dialog", { name: "원격 이름 바꾸기" });
  await rename.locator("input.text").fill("github");
  await rename.getByRole("button", { name: "바꾸기" }).click();
  await demo.toast(/원격 이름을 github.{1,2} 바꿨어요/);
  let snap = await demo.snapshot();
  expect(snap.remotes.map((r) => r.name)).toEqual(["github"]);
  expect(snap.refs.some((r) => r.name === "github/main")).toBe(true);
  expect(snap.head.upstream).toBe("github/feature/graph-zoom");

  await menu("github", "URL 바꾸기…");
  const url = page.getByRole("dialog", { name: "github의 URL" });
  const field = url.locator("input.text");
  await expect(field).toHaveValue("https://github.com/ddugit/ddugit-demo.git");
  await expect(url.getByRole("button", { name: "바꾸기" })).toBeDisabled();
  await field.fill("git@github.com:ddugit/ddugit-demo.git");
  await url.getByRole("button", { name: "바꾸기" }).click();
  await demo.toast("github의 URL을 바꿨어요");
  snap = await demo.snapshot();
  expect(snap.remotes).toEqual([{ name: "github", url: "git@github.com:ddugit/ddugit-demo.git", push: true }]);
});

test("resets the current branch onto a remote branch on another line, counting what leaves and comes", async ({
  demo,
}) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const theme = before.refs.find((r) => r.name === "origin/feature/theme")!;
  await page
    .locator(".sidebar section.remote-sub")
    .filter({ hasText: "origin" })
    .locator("li", { hasText: "feature/theme" })
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: "feature/graph-zoom을 여기로 리셋…" }).click();
  const dialog = page.getByRole("dialog", { name: "리셋" });
  await expect(dialog).toContainText("다른 갈래의 “origin/feature/theme”로 리셋해요");
  await expect(dialog).toContainText(/이 브랜치에만 있는 커밋 \d+개는 브랜치에서 빠지고, 커밋 \d+개가 새로 들어와요/);
  await expect(dialog).toContainText("두 갈래의 차이가 모두 커밋하지 않은 변경으로 남아요");
  await dialog.getByText("변경은 작업 트리에 남기기 (mixed)").click();
  await dialog.getByRole("button", { name: "리셋" }).click();
  await demo.toast("feature/graph-zoom을 리셋했어요");
  const after = await demo.snapshot();
  expect(after.head.branch).toBe("feature/graph-zoom");
  expect(after.head.target).toBe(theme.target);
  expect(after.changes.length).toBeGreaterThan(before.changes.length);
});
