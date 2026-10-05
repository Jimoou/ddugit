// Pro features and their Free offers: backport, transfer, stacked branches and release notes.

import { demoFlags, expect, test } from "./fixtures";

test("backports a missing commit and then counts it as applied", async ({ demo }) => {
  const { page } = demo;
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 없는 커밋 보기");
  const sheet = page.locator(".backport-sheet");
  await expect(sheet.locator("tbody tr").first()).toBeVisible();
  const missing = async () => Number(await sheet.locator("b.bp-missing").textContent());
  const before = await missing();
  expect(before).toBeGreaterThan(1);

  await sheet.locator("tbody tr").first().locator("input[type=checkbox]").check();
  await page.screenshot({ path: "test-results/backport.png" });
  await sheet.getByRole("button", { name: /cherry-pick$/ }).click();
  await page.click(".dialog button.primary");
  await demo.toast(/개 커밋을 .*에 가져왔어요/);
  await expect.poll(missing).toBe(before - 1);

  // Ignoring hides nothing but moves the commit out of the missing count.
  await sheet.getByRole("button", { name: "제외", exact: true }).first().click();
  await expect.poll(missing).toBe(before - 2);
});

test("adds the original project as a remote and lists its fixes to backport", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".sidebar").getByTitle("원격 저장소 추가").click();
  await page.fill(".dialog input >> nth=0", "upstream");
  await page.fill(".dialog input >> nth=1", "https://example.com/original.git");
  await page.click(".dialog button.primary");
  // The fetch of the new remote shows on the progress card, then says what came.
  await expect(page.locator(".job-card")).toContainText("upstream에서 가져오는 중");
  await demo.toast("upstream에서 브랜치 1개를 가져왔어요");
  await expect(page.locator(".job-card")).toHaveCount(0);

  // Two remotes now: a fold per remote, branches without the prefix.
  const upstream = page.locator(".sidebar section.remote-sub").filter({ hasText: "upstream" });
  await expect(page.locator(".sidebar section.remote-sub")).toHaveCount(2);
  await expect(upstream.locator("li")).toHaveText(["main"]);
  await upstream.locator("li").click({ button: "right" });
  await page.click(".context-menu >> text=에 없는 커밋 보기");
  const sheet = page.locator(".backport-sheet");
  await expect(sheet.locator("tbody tr")).not.toHaveCount(0);
  await expect(sheet.locator("tbody")).toContainText("Fix crash on empty repository");
  await expect(sheet.locator(".bp-hint")).toHaveCount(0);
});

test("opens backport from the sidebar with a guide, into the current branch", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  await demo.branchTool("백포트…");
  const sheet = page.locator(".backport-sheet");
  await expect(sheet).toBeVisible();
  await expect(sheet.getByLabel("받는 쪽")).toHaveValue(snap.head.branch!);
  await expect(sheet.getByLabel("가져올 쪽")).not.toHaveValue(snap.head.branch!);
  // The guide starts folded; unfolded once, it stays open.
  const guide = sheet.locator(".bp-guide");
  await expect(guide.locator("ol")).toHaveCount(0);
  await guide.locator(".bp-guide-head").click();
  await expect(guide.locator("ol li")).toHaveCount(3);
  await page.reload();
  await demo.branchTool("백포트…");
  await expect(page.locator(".backport-sheet .bp-guide ol li")).toHaveCount(3);
});

test("ignores are per target and the overview counts each branch", async ({ demo }) => {
  const { page } = demo;
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 없는 커밋 보기");
  const sheet = page.locator(".backport-sheet");
  await sheet.getByRole("button", { name: "제외", exact: true }).first().click();

  await sheet.getByRole("tab", { name: "대상별" }).click();
  const row = (name: string) => sheet.locator(".bp-overview tbody tr", { hasText: name });
  await expect(row("feature/graph-zoom").locator("td").nth(3)).toHaveText("1");
  await expect(row("feature/login").locator("td").nth(3)).toHaveText("0");
  await expect(sheet.locator(".bp-overview tbody tr", { hasText: "feature/theme" })).toHaveCount(0);

  // Opening a row switches the target and goes back to its missing list.
  await row("feature/login").click();
  await expect(sheet.getByRole("combobox", { name: "받는 쪽" })).toHaveValue("feature/login");
  await expect(sheet.getByRole("tab", { name: "미반영" })).toHaveAttribute("aria-selected", "true");
});

test("a backported commit that is already there stops as empty and is skipped, not sent to the conflict sheet", async ({
  demo,
}) => {
  const { page } = demo;
  await demo.mutateQuietly((d) => (d.emptyNext = true));
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 없는 커밋 보기");
  const sheet = page.locator(".backport-sheet");
  for (const i of [0, 1]) await sheet.locator("tbody tr").nth(i).locator("input[type=checkbox]").check();
  await sheet.getByRole("button", { name: /cherry-pick$/ }).click();
  await page.click(".dialog button.primary");

  const dialog = page.locator(".dialog").filter({ hasText: "이미 들어 있는 변경" });
  await expect(dialog).toContainText("충돌한 파일도 없어요");
  await expect(page.locator(".conflict-sheet")).toHaveCount(0);
  await expect(page.locator(".banner")).toContainText("충돌한 파일은 없어요");
  await dialog.getByRole("button", { name: "이 커밋 건너뛰기" }).click();
  await demo.toast("이 커밋을 건너뛰고 이어서 진행했어요");
  expect((await demo.snapshot()).state).toBe("clean");
});

test("on Free, private pull requests and backport actions offer Pro instead", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  await page.getByRole("dialog", { name: "설정" }).getByRole("tab", { name: "라이선스" }).click();
  await expect(page.locator(".license-plan")).toContainText("Pro 사용 중");
  await expect(page.locator("section.license")).not.toContainText("체험");
  await page.keyboard.press("Escape");
  await demoFlags(page, { Pro: { pro: false, source: "free" } });
  await page.reload();

  // The demo repository is private: its pull requests stay closed on Free.
  const pulls = page.locator(".sidebar section.pulls");
  await expect(pulls.locator(".pr-locked")).toContainText("Pro 기능");
  await pulls.locator(".pr-locked button").click();
  const offer = page.locator(".dialog.pro-offer");
  await expect(offer).toContainText("비공개 저장소와 회사 서버의 PR");
  await offer.getByRole("button", { name: "닫기" }).click();
  await expect(offer).toHaveCount(0);

  // Comparing is free; cherry-picking is Pro.
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 없는 커밋 보기");
  const sheet = page.locator(".backport-sheet");
  await sheet.locator("tbody tr").first().locator("input[type=checkbox]").check();
  await sheet.getByRole("button", { name: /cherry-pick/ }).click();
  await expect(offer).toContainText("백포트 실행");
  await offer.getByRole("button", { name: "이미 구매했어요" }).click();
  await expect(page.locator(".license-plan")).toContainText("Free");
});

test("air-gapped transfer writes only what a destination lacks, and imports a bundle as remote branches", async ({
  demo,
}) => {
  const { page } = demo;
  await demo.branchTool("폐쇄망 반출입…");
  const dialog = page.locator(".dialog.transfer");
  await dialog.getByPlaceholder("예: 고객사 이름").fill("acme");
  await expect(dialog.locator(".tr-branches")).toContainText("처음부터 전부");
  await dialog.getByRole("button", { name: /폴더 고르고 반출/ }).click();
  await demo.toast("acme에 보낼 번들을 만들었어요");

  // The second time, the branch goes from the last transfer; with nothing new, it says so.
  await expect(dialog.locator(".tr-branches")).toContainText("지난 반출");
  await expect(dialog.locator(".tr-history")).toContainText("acme");
  await dialog.getByRole("button", { name: /폴더 고르고 반출/ }).click();
  await demo.toast(/Nothing new for acme/);

  await dialog.getByRole("tab", { name: "반입(안으로)" }).click();
  await dialog.getByRole("button", { name: "번들 파일 고르기…" }).click();
  await expect(dialog.locator(".tr-heads")).toContainText("feature/theme");
  await expect(dialog.locator("input.text")).toHaveValue("acme");
  await dialog.getByRole("button", { name: /^반입/ }).click();
  await demo.toast("번들을 acme로 반입했어요");
  await expect(dialog).toHaveCount(0);
  expect((await demo.snapshot()).refs.some((r) => r.name === "acme/main")).toBe(true);
});

test("on Free, air-gapped transfer offers Pro", async ({ demo }) => {
  const { page } = demo;
  await demoFlags(page, { Pro: { pro: false, source: "free" } });
  await page.reload();
  await demo.branchTool("폐쇄망 반출입…");
  const dialog = page.locator(".dialog.transfer");
  await dialog.getByPlaceholder("예: 고객사 이름").fill("acme");
  await dialog.getByRole("button", { name: /폴더 고르고 반출/ }).click();
  await expect(page.locator(".dialog.pro-offer")).toContainText("폐쇄망");
});

test("a stacked branch falls behind when the branch below moves, and restacking puts it back on top", async ({
  demo,
}) => {
  const { page } = demo;
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=이 브랜치 위에 새 브랜치 쌓기");
  await page.locator(".dialog input.text").fill("feature/theme-ui");
  await page.keyboard.press("Enter");
  await demo.toast("feature/theme-ui를 feature/theme 위에 쌓았어요");

  const stacks = page.locator(".sidebar section.stacks");
  const row = stacks.locator("li", { hasText: "feature/theme-ui" });
  await expect(stacks.locator(".stack-base")).toContainText("feature/theme");
  await demo.mutate((d) => d.grow(1));
  await expect(row).toContainText("커밋 1개");

  // The branch below gets a new commit: the one on top no longer has it.
  await demo.mutate((d) => d.commitOn("feature/theme", "Theme fix"));
  await expect(row).toContainText("다시 쌓기 필요");
  await stacks.getByRole("button", { name: "다시 쌓기" }).click();
  await demo.toast("스택을 다시 쌓았어요");
  await expect(row).toContainText("커밋 1개");
  const s = await demo.snapshot();
  const tip = (name: string) => s.refs.find((r) => r.kind === "local" && r.name === name)!.target;
  expect(s.commits.find((c) => c.id === tip("feature/theme-ui"))!.parents).toEqual([tip("feature/theme")]);

  // Taking it out of the stack leaves the branch alone.
  await row.click({ button: "right" });
  await page.click(".context-menu >> text=스택에서 빼기");
  await expect(stacks).toHaveCount(0);
});

test("on Free, stacking a branch offers Pro", async ({ demo }) => {
  const { page } = demo;
  await demoFlags(page, { Pro: { pro: false, source: "free" } });
  await page.reload();
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=이 브랜치 위에 새 브랜치 쌓기");
  await expect(page.locator(".dialog.pro-offer")).toContainText("스택 브랜치");
});

test("release notes group the commits since the previous tag by kind, and copy as Markdown", async ({ demo }) => {
  const { page } = demo;
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.click(".sidebar li >> text=v0.2.0", { button: "right" });
  await page.click(".context-menu >> text=여기까지 릴리스 노트 만들기");
  const dialog = page.locator(".dialog.notes");
  const md = dialog.locator("textarea");
  await expect(dialog.locator("select")).toHaveValue("v0.1.0");
  await expect(md).toHaveValue(/^## v0\.2\.0 \(/);
  // Plain branch merges give the commits they brought in, oldest first.
  await expect(md).toHaveValue(/### 새 기능\n\n- login form UI .*\n- hook up auth API .*\n- remember-me checkbox/);
  await expect(md).toHaveValue(/### 버그 수정\n\n- typo in README .*\n- crash on empty repo/);

  // Leave out the chores; then start from the first commit.
  await expect(md).toHaveValue(/### 기타/);
  await dialog.getByLabel("기타(chore·ci·test 등)도 넣기").uncheck();
  await expect(md).not.toHaveValue(/### 기타/);
  await dialog.locator("select").selectOption("");
  await expect(md).toHaveValue(/- add project skeleton/);

  // Edits by hand are what gets copied.
  await md.fill("## v0.2.0\n\nHand-written.\n");
  await dialog.getByRole("button", { name: "Markdown 복사" }).click();
  await demo.toast("릴리스 노트를 복사했어요");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("## v0.2.0\n\nHand-written.\n");
});

test("on Free, release notes offer Pro", async ({ demo }) => {
  const { page } = demo;
  await demoFlags(page, { Pro: { pro: false, source: "free" } });
  await page.reload();
  await page.click(".sidebar li >> text=v0.2.0", { button: "right" });
  await page.click(".context-menu >> text=여기까지 릴리스 노트 만들기");
  await expect(page.locator(".dialog.pro-offer")).toContainText("릴리스 노트");
});

test("a bundle with a bad checksum or missing prerequisite commits is not imported", async ({ demo }) => {
  const { page } = demo;
  await demo.branchTool("폐쇄망 반출입…");
  const dialog = page.locator(".dialog.transfer");
  await dialog.getByRole("tab", { name: "반입(안으로)" }).click();
  const importButton = dialog.getByRole("button", { name: /^반입/ });
  const check = dialog.locator(".tr-check");
  const pick = async (how: "mismatch" | "missing" | "absent") => {
    await page.evaluate((how) => (window.__ddugitDemo.nextBundle = how), how);
    await dialog.getByRole("button", { name: "번들 파일 고르기…" }).click();
  };

  await pick("mismatch");
  await expect(check.locator(".note.warn")).toHaveText("체크섬(.sha256)이 맞지 않아요. 파일이 손상됐거나 바뀌었어요.");
  await expect(importButton).toBeDisabled();

  await pick("missing");
  await expect(check.locator(".note.warn")).toHaveText(
    "이 번들이 기대는 커밋 2개가 이 저장소에 없어요. 앞선 번들을 먼저 반입해 주세요.",
  );
  await expect(importButton).toBeDisabled();

  // Without a .sha256 the commits are still checked, and it can come in.
  await pick("absent");
  await expect(check).toContainText(".sha256 파일이 없어서 체크섬은 확인하지 못했어요");
  await expect(check.locator(".note.warn")).toHaveCount(0);
  await expect(importButton).toBeEnabled();
  expect((await demo.snapshot()).refs.some((r) => r.name.startsWith("acme/"))).toBe(false);
});

test("exports picked backport commits as numbered patches into a chosen folder", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => (window.__ddugitDemo.nextFolder = "/work/patches"));
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 없는 커밋 보기");
  const sheet = page.locator(".backport-sheet");
  const rows = sheet.locator("tbody tr");
  await expect(rows.first()).toBeVisible();
  await rows.nth(0).locator("input[type=checkbox]").check();
  await rows.nth(1).locator("input[type=checkbox]").check();
  const before = await demo.snapshot();
  await sheet.getByRole("button", { name: /패치로 내보내기/ }).click();
  await demo.toast("패치 2개를 저장했어요");
  // Exporting writes files only: no branch moves.
  expect((await demo.snapshot()).refs).toEqual(before.refs);
});
