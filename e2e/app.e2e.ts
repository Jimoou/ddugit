import { expect, test } from "./fixtures";

test("adds a checkpoint from the + composer", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.fill("textarea.message", "Wire up minimap jump");
  await page.keyboard.press("Control+Enter");
  await demo.toast("체크포인트를 추가했어요");
  const snap = await demo.snapshot();
  const head = snap.commits.find((c) => c.id === snap.head.target)!;
  expect(head.summary).toBe("Wire up minimap jump");
  expect(snap.changes).toEqual([]);
});

test("merges by dragging a branch tip onto HEAD", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const tip = before.refs.find((r) => r.kind === "local" && r.name === "feature/theme")!.target;
  const a = (await demo.screenOf(tip))!;
  const z = (await demo.screenOf(before.head.target!))!;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y - 10, { steps: 8 });
  await page.mouse.move(z.x, z.y, { steps: 12 });
  await page.mouse.up();
  await page.click(".dialog button.primary");
  await expect.poll(async () => (await demo.snapshot()).head.target).not.toBe(before.head.target);
  const snap = await demo.snapshot();
  expect(snap.commits.find((c) => c.id === snap.head.target)!.parents).toEqual([before.head.target, tip]);
  // The two stars fuse where the merge commit landed.
  await expect(page.locator(".fx-clip .fusion")).toHaveCount(1);
});

test("resolves a conflict block by editing it by hand", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => (d.conflictNext = true));
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 병합");
  await page.click(".dialog button.primary");
  await expect(page.locator(".conflict-sheet")).toBeVisible();
  await expect(page.locator(".conflict-sheet header")).toContainText("남은 파일 2개");
  // A red nebula hangs over the graph while anything is in conflict.
  const nebula = page.locator(".stage-graph .nebula");
  await expect(nebula).toHaveClass(/\bon\b/);

  await page.locator(".block").nth(0).getByRole("button", { name: "직접 편집" }).click();
  await page.fill(".block-edit", "hand merged line");
  await page.locator(".block").nth(1).getByRole("button", { name: "둘 다" }).click();
  await page.click("text=이 파일 해결 완료");
  await expect(page.locator(".conflict-sheet header")).toContainText("남은 파일 1개");
  await expect(nebula).toHaveClass(/\bon\b/);

  // Resolving the last file clears the nebula.
  await page
    .getByRole("button", { name: /파일 전체:/ })
    .first()
    .click();
  await expect(nebula).not.toHaveClass(/\bon\b/);
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

test("folds a straight run when zoomed out and unfolds it on click", async ({ demo }) => {
  const { page } = demo;
  const before = (await demo.snapshot()).commits.length;
  await demo.mutate((d) => d.grow(7));
  expect((await demo.snapshot()).commits.length).toBe(before + 7);
  const hud = page.locator(".hud button");
  for (let i = 0; i < 4; i++) await hud.nth(0).click();
  await expect.poll(() => demo.zoom()).toBeLessThan(50);

  // The commits between the old tip and HEAD form the run.
  const snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  let id = byId.get(snap.head.target!)!.parents[0];
  const run: string[] = [];
  for (let i = 0; i < 6; i++, id = byId.get(id)!.parents[0]) run.push(id);
  const [newest, oldest] = [(await demo.screenOf(run[0]))!, (await demo.screenOf(run[5]))!];
  await page.mouse.click((newest.x + oldest.x) / 2, newest.y);
  await expect.poll(() => demo.zoom()).toBeGreaterThanOrEqual(65);
});

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
  await demo.toast("원격 upstream을(를) 추가했어요");
  await expect(page.locator(".sidebar li >> text=upstream/main")).toBeVisible();

  await page.click(".sidebar li >> text=upstream/main", { button: "right" });
  await page.click(".context-menu >> text=에 없는 커밋 보기");
  const sheet = page.locator(".backport-sheet");
  await expect(sheet.locator("tbody tr")).not.toHaveCount(0);
  await expect(sheet.locator("tbody")).toContainText("Fix crash on empty repository");
  await expect(sheet.locator(".bp-hint")).toHaveCount(0);
});

test("reorders and folds commits with the interactive rebase sheet", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.grow(3));
  const before = await demo.snapshot();
  const byId = new Map(before.commits.map((c) => [c.id, c]));
  const parent = (id: string) => byId.get(id)!.parents[0];
  const base = parent(parent(parent(before.head.target!)));
  // Wait for the grown commits to be on the canvas, then open the node menu on the base.
  await expect.poll(async () => (await demo.screenOf(before.head.target!)) !== null).toBe(true);
  const at = (await demo.screenOf(base))!;
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.click(".context-menu >> text=이 다음 커밋들 정리");

  const rows = page.locator(".rb-list li");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Step 1 of 3");
  await rows.nth(2).dragTo(rows.nth(0));
  await expect(rows.nth(0)).toContainText("Step 3 of 3");
  await rows.nth(2).locator("select").selectOption("fixup");
  await expect(page.locator(".rebase-sheet header")).toContainText("3개 → 2개");
  await page.click(".rebase-sheet button.primary");
  await demo.toast("커밋을 정리했어요");

  const snap = await demo.snapshot();
  const now = new Map(snap.commits.map((c) => [c.id, c]));
  const head = now.get(snap.head.target!)!;
  const prev = now.get(head.parents[0])!;
  expect([prev.summary, head.summary]).toEqual(["Step 3 of 3", "Step 1 of 3"]);
  expect(prev.parents[0]).toBe(base);
  await expect(page.locator(".rebase-sheet")).toHaveCount(0);
  // The two replayed commits relink as a constellation, a star on each.
  await expect(page.locator(".fx-clip .twinkle")).toHaveCount(2);
});

test("overwrites the upstream after rewriting a pushed commit", async ({ demo }) => {
  const { page } = demo;
  const push = page.locator(".topbar button", { hasText: "Push" });
  await push.click();
  await demo.toast("원격에 올렸어요");

  // Reword the (now pushed) HEAD commit.
  const head = (await demo.snapshot()).head.target!;
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.click(".context-menu >> text=마지막 커밋 수정");
  await page.fill("textarea.message", "Reworded after review");
  await page.keyboard.press("Control+Enter");
  await expect.poll(async () => (await demo.snapshot()).head.target).not.toBe(head);

  await push.click();
  const dialog = page.locator(".dialog", { hasText: "Push 거부됨" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /덮어쓰기/ }).click();
  await demo.toast("원격을 내 이력으로 덮어썼어요");
  const snap = await demo.snapshot();
  const upstream = snap.refs.find((r) => r.kind === "remote" && r.name === snap.head.upstream)!;
  expect(upstream.target).toBe(snap.head.target);
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

test("settings: shortcut table, sparkles and git path", async ({ demo }) => {
  const { page } = demo;
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 40, y: 40 } });
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "설정" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("kbd", { hasText: "⌘/Ctrl + F" })).toBeVisible();

  await dialog.getByRole("checkbox").uncheck();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!).animate)).toBe(false);
  await expect(page.locator(".topbar button[title='반짝임 효과']")).not.toHaveClass(/\bon\b/);

  const git = dialog.getByPlaceholder("비워 두면 PATH의 git");
  await git.fill("/usr/bin/nope");
  await dialog.getByRole("button", { name: "확인하고 적용" }).click();
  await expect(dialog.locator(".note.warn")).toContainText("not a git executable");
  await git.fill("/opt/homebrew/bin/git");
  await dialog.getByRole("button", { name: "확인하고 적용" }).click();
  await expect(dialog.locator(".note")).toContainText("git version");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});

test("moves through commits with the keyboard and announces them", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  const head = byId.get(snap.head.target!)!;
  const parent = byId.get(head.parents[0])!;
  const live = page.locator(".graph .sr-only");

  await page.keyboard.press("ArrowLeft"); // first arrow selects HEAD
  await expect(live).toContainText(head.summary);
  await expect(live).toContainText("HEAD");
  await page.keyboard.press("ArrowLeft");
  await expect(live).toContainText(parent.summary);
  await page.keyboard.press("ArrowRight");
  await expect(live).toContainText(head.summary);

  await page.keyboard.press("Enter");
  await expect(page.locator(".context-menu")).toBeVisible();
  await expect(page.locator(".context-menu")).toContainText("여기서 새 브랜치");
});

test("shift-dragging a commit onto another opens the rebase plan with it moved", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.grow(3));
  const before = await demo.snapshot();
  const byId = new Map(before.commits.map((c) => [c.id, c]));
  const head = before.head.target!;
  const step2 = byId.get(head)!.parents[0];
  const step1 = byId.get(step2)!.parents[0];
  await expect.poll(async () => (await demo.screenOf(head)) !== null).toBe(true);

  const a = (await demo.screenOf(head))!;
  const z = (await demo.screenOf(step1))!;
  await page.keyboard.down("Shift");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x - 30, a.y + 20, { steps: 6 });
  await page.mouse.move(z.x, z.y, { steps: 10 });
  await expect(page.locator(".drag-hint")).toContainText("순서 정리 화면");
  await page.mouse.up();
  await page.keyboard.up("Shift");

  const rows = page.locator(".rb-list li");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Step 1 of 3");
  await expect(rows.nth(1)).toContainText("Step 3 of 3");
  await page.click(".rebase-sheet button.primary");
  await demo.toast("커밋을 정리했어요");
  const snap = await demo.snapshot();
  const now = new Map(snap.commits.map((c) => [c.id, c]));
  expect(now.get(snap.head.target!)!.summary).toBe("Step 2 of 3");
});

test("settings: switching to English relabels the app and is remembered", async ({ demo }) => {
  const { page } = demo;
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByLabel("언어").selectOption("en");
  await expect(page.getByRole("dialog", { name: "Settings" })).toContainText("Shortcuts");
  await page.keyboard.press("Escape");
  await expect(page.locator(".topbar")).toContainText("Commit");
  await expect(page.locator(".hint")).toContainText("Drag to pan");
  await page.locator(".topbar").getByText("Commit").click();
  await expect(page.locator(".composer")).toContainText("Add checkpoint");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.locator(".topbar")).toContainText("Demo mode");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
});

test("clones from a URL, remembers it in the repository menu and stars it", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(
    () => ((window as unknown as { __ddugitDemo: { nextFolder: string } }).__ddugitDemo.nextFolder = "/work"),
  );
  await page.locator(".topbar .repo").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /URL로 가져오기/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  await dialog.getByPlaceholder("https://github.com/owner/repo.git").fill("https://github.com/acme/rocket.git");
  await dialog.getByRole("button", { name: "고르기…" }).click();
  await expect(dialog).toContainText("→ /work/rocket");
  await dialog.getByRole("button", { name: "가져오기" }).click();
  await demo.toast("rocket을(를) 가져왔어요");

  await page.locator(".topbar .repo").click();
  const row = page.locator(".repo-menu .recent-list li").filter({ hasText: "/work/rocket" });
  await expect(row).toHaveClass(/on/);
  await row.getByRole("button", { name: "즐겨찾기", exact: true }).click();
  await expect(row.locator(".star")).toHaveAttribute("aria-pressed", "true");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.recent")!));
  expect(stored[0]).toMatchObject({ path: "/work/rocket", starred: true });
});

test("creates a new repository in a plain folder", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(
    () => ((window as unknown as { __ddugitDemo: { nextFolder: string } }).__ddugitDemo.nextFolder = "/tmp/not-a-repo"),
  );
  await page.locator(".topbar .repo").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /새 저장소 만들기/ })
    .click();
  await demo.toast("새 저장소를 만들었어요");
  await page.locator(".topbar .repo").click();
  await expect(page.locator(".repo-menu .recent-list li.on")).toContainText("/tmp/not-a-repo");
});

test("opens repositories in tabs and keeps each tab's state", async ({ demo }) => {
  const { page } = demo;
  const tabs = page.locator(".tabbar .tab");
  await expect(tabs).toHaveCount(1);

  // Select a commit in the first tab so we can see it survive a switch.
  const snap = await demo.snapshot();
  const head = snap.head.target!;
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y);
  await expect(page.locator(".inspector")).toBeVisible();

  await page.locator(".tab-new").click();
  await expect(tabs).toHaveCount(2);
  await expect(page.locator(".welcome")).toContainText("최근 저장소");
  await page.evaluate(
    () => ((window as unknown as { __ddugitDemo: { nextFolder: string } }).__ddugitDemo.nextFolder = "/work/second"),
  );
  await page
    .locator(".welcome")
    .getByRole("button", { name: /폴더 열기/ })
    .click();
  await expect(tabs.nth(1)).toContainText("second");
  await expect(page.locator(".app:not([hidden]) .inspector")).toHaveCount(0);

  await tabs.nth(0).click();
  await expect(page.locator(".app:not([hidden]) .inspector")).toBeVisible();

  await tabs.nth(1).getByRole("button", { name: /닫기/ }).click();
  await expect(tabs).toHaveCount(1);
});

test("undoes the last commit, goes back hard, then rescues the lost commit from the reflog", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.grow(2));
  const before = await demo.snapshot();
  const head = before.head.target!;
  const byId = new Map(before.commits.map((c) => [c.id, c]));
  const parent = byId.get(head)!.parents[0];
  const grand = byId.get(parent)!.parents[0];

  // Undo the last commit: HEAD moves to its parent, its change comes back staged.
  await expect.poll(async () => (await demo.screenOf(head)) !== null).toBe(true);
  let at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.click(".context-menu >> text=마지막 커밋 취소");
  await demo.toast("마지막 커밋을 취소했어요");
  await expect.poll(async () => (await demo.snapshot()).head.target).toBe(parent);
  expect((await demo.snapshot()).changes.some((c) => c.staged)).toBe(true);

  // Go back one more, discarding everything.
  at = (await demo.screenOf(grand))!;
  await page.mouse.click(at.x, at.y, { button: "right" });
  await page.click(".context-menu >> text=이 커밋으로 되돌리기");
  const dialog = page.getByRole("dialog", { name: "되돌리기" });
  await dialog.getByText("변경까지 모두 버리기 (hard)").click();
  await expect(dialog).toContainText("커밋하지 않은 변경");
  await dialog.getByRole("button", { name: "되돌리기" }).click();
  await expect.poll(async () => (await demo.snapshot()).head.target).toBe(grand);
  expect((await demo.snapshot()).changes).toEqual([]);

  // The undone commit is only in the reflog now: rescue it as a branch.
  await page.getByRole("button", { name: "되돌리기 기록 (reflog)" }).click();
  const row = page.locator(".reflog-list li.lost").filter({ hasText: head.slice(0, 7) });
  await row.getByRole("button", { name: "브랜치로 살리기" }).click();
  await page.locator(".dialog input").fill("rescued");
  await page.locator(".dialog button.primary").click();
  await demo.toast("rescued 브랜치로 살렸어요");
  expect((await demo.snapshot()).refs.find((r) => r.name === "rescued")?.target).toBe(head);
  await expect(page.locator(".reflog-list li.lost").filter({ hasText: head.slice(0, 7) })).toHaveCount(0);
});

test("cleans up merged and gone branches from the sidebar", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => {
    (d as unknown as { goneBranches: string[] }).goneBranches = ["feature/theme"];
  });
  await page.getByRole("button", { name: "브랜치 정리" }).click();
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
  const file = page.locator(".inspector .changed li").first();
  await file.click({ button: "right" });
  await page.click(".context-menu >> text=이 커밋 이전 상태로");
  await expect(page.locator(".toast").filter({ hasText: "되돌렸어요" })).toBeVisible();
  expect((await demo.snapshot()).changes.some((c) => c.staged)).toBe(true);
});

test("hunts down the commit that broke something with bisect", async ({ demo }) => {
  // Many steps, each waiting on the graph: give a slow runner room.
  test.slow();
  const { page } = demo;
  await demo.mutate((d) => d.grow(7));
  const snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  // HEAD and the 7 grown commits below it, newest first.
  const line: string[] = [];
  for (let c: string | undefined = snap.head.target!; c && line.length < 8; c = byId.get(c)?.parents[0]) line.push(c);
  const [bad, good] = [line[0], line[7]];
  const culprit = line[4]; // the bug appeared here
  // Bring HEAD into view at normal zoom (fitting would fold the straight run into a bar).
  await page.locator(".app:not([hidden]) .graph-area canvas").focus();
  await page.keyboard.press("h");
  // The move eases in over a few frames; give it a moment to start before sampling positions.
  await page.waitForTimeout(150);

  for (const [id, label] of [
    [bad, "버그가 있는 커밋으로 표시"],
    [good, "버그가 없는 커밋으로 표시"],
  ] as const) {
    await (await demo.commitMenu(id)).getByText(label).click();
  }
  await demo.toast("버그 찾기를 시작했어요");

  const banner = page.locator(".bisect-banner");
  for (let i = 0; i < 6 && !(await banner.textContent())?.includes("범인을 찾았어요"); i++) {
    const text = (await banner.textContent()) ?? "";
    const sha = /지금 (\w{7})/.exec(text)![1];
    const idx = line.findIndex((c) => c.startsWith(sha));
    // Commits from the culprit on (newer, lower index) have the bug.
    await banner.getByRole("button", { name: idx <= 4 ? "버그 있음" : "버그 없음" }).click();
    await expect(banner).not.toContainText(`지금 ${sha}`);
  }
  await expect(banner).toContainText(`범인을 찾았어요: ${culprit.slice(0, 7)}`);
  await banner.getByRole("button", { name: "끝내기" }).click();
  await expect(banner).toHaveCount(0);
});

test("traces a file through history and shows who changed each line", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const tip = (await demo.screenOf(snap.head.target!))!;
  await page.mouse.click(tip.x, tip.y);
  const file = page.locator(".inspector .changed li").first();
  await file.click({ button: "right" });
  await page.click(".context-menu >> text=이 파일이 지나온 커밋 보기");

  const banner = page.locator(".trail-banner");
  await expect(banner).toContainText("별자리로 이었어요");
  const n = Number(/커밋 (\d+)개/.exec((await banner.textContent()) ?? "")![1]);
  expect(n).toBeGreaterThan(0);

  // Stepping older moves the selection along the trail.
  const before = await page.locator(".inspector").textContent();
  await banner.getByRole("button", { name: /더 예전/ }).click();
  if (n > 1) await expect(page.locator(".inspector")).not.toHaveText(before ?? "");

  // Blame for the selected commit: one hunk per commit in the demo, each jumping to its commit.
  await banner.getByRole("button", { name: "줄마다 보기" }).click();
  const sheet = page.locator(".blame-sheet");
  await expect(sheet).toContainText("줄마다 누가 고쳤나");
  await expect(sheet.locator(".blame-hunk").first()).toBeVisible();
  await sheet.locator(".blame-gutter").first().click();
  await expect(sheet.locator(".blame-hunk.on")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await banner.getByRole("button", { name: "닫기" }).click();
  await expect(banner).toHaveCount(0);
});

test("a push rides a comet into orbit and fetched commits arrive as meteors, unless sparkles are off", async ({
  demo,
}) => {
  const { page } = demo;
  const launch = page.locator(".fx-clip .launch");
  const meteors = page.locator(".fx-clip .meteor");

  await page.getByRole("button", { name: /Push/ }).click();
  await demo.toast("원격에 올렸어요");
  await expect(launch).toHaveCount(1);
  await expect(launch).toHaveCount(0, { timeout: 5000 });

  // The demo's first fetch brings one commit to origin/main and one to the upstream.
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  await expect(meteors).toHaveCount(2);

  // Sparkles off: the same moments play nothing.
  await page.locator(".topbar button[title='반짝임 효과']").click();
  await expect(meteors).toHaveCount(0, { timeout: 5000 });
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  await page.getByRole("button", { name: /Push/ }).click();
  await page.waitForTimeout(300);
  await expect(launch).toHaveCount(0);
});

test("cherry-picks a commit from its menu and a comet carries the copy over", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const main = before.refs.find((r) => r.kind === "local" && r.name === "main")!.target;
  await (await demo.commitMenu(main)).getByText(/에 cherry-pick$/).click();
  await page.click(".dialog button.primary");
  await demo.toast(/에 복사했어요/);
  const snap = await demo.snapshot();
  expect(snap.commits.find((c) => c.id === snap.head.target)!.parents).toEqual([before.head.target]);
  await expect(page.locator(".fx-clip .pick-comet")).toHaveCount(1);
});

test("lists open pull requests, checks one out, and connects or forgets a forge token", async ({ demo }) => {
  const { page } = demo;
  const section = page.locator(".sidebar .pulls");
  // `gh` is logged in (demo): open PRs show without asking, and there is no token to manage.
  await expect(section.locator("li")).toHaveCount(2);
  await expect(section.locator("li").nth(0)).toContainText("#12");
  await expect(section.locator("li").nth(1)).toContainText("초안");
  // CI and review state ride along: #12 passed and is approved, #15 failed.
  await expect(section.locator("li").nth(0).locator(".pr-ci")).toHaveClass(/success/);
  await expect(section.locator("li").nth(0)).toContainText("승인");
  await expect(section.locator("li").nth(1).locator(".pr-ci")).toHaveClass(/failure/);
  await expect(section.getByRole("button", { name: "토큰 관리" })).toHaveCount(0);

  await section.locator("li").nth(0).click({ button: "right" });
  await page.click(".context-menu >> text=feature/theme 브랜치 체크아웃");
  await expect.poll(async () => (await demo.snapshot()).head.branch).toBe("feature/theme");

  // Without a login the section offers to connect; a pasted token is saved and can be forgotten.
  await demo.mutate((d) => (d.forgeToken = "none"));
  await page.getByRole("button", { name: /Fetch/ }).click(); // remote work re-reads pull requests
  await expect(section).toContainText("GitHub에 연결하면");
  await expect(section.locator("li")).toHaveCount(0);
  await section.getByRole("button", { name: "GitHub 연결" }).click();
  const dialog = page.getByRole("dialog", { name: "GitHub 연결" });
  await dialog.getByLabel("토큰").fill("ghp_demo");
  await dialog.getByLabel("토큰").press("Enter");
  await demo.toast("GitHub에 연결했어요");
  await expect(section.locator("li")).toHaveCount(2);

  await section.getByRole("button", { name: "토큰 관리" }).click();
  await dialog.getByRole("button", { name: "저장된 토큰 지우기" }).click();
  await demo.toast("저장된 토큰을 지웠어요");
  await expect(section.getByRole("button", { name: "GitHub 연결" })).toBeVisible();
});

test("the tutorial voyage ticks off missions as they are done, and can be closed and reopened", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => localStorage.setItem("ddugit.voyage", JSON.stringify({ done: [], dismissed: false })));
  await page.reload();
  const log = page.getByRole("complementary", { name: "항해 일지" });
  await expect(log).toContainText("0 / 6");
  await expect(log.locator("li.now")).toContainText("별 하나 살펴보기");

  // Mission 1: look at a commit.
  const snap = await demo.snapshot();
  const at = (await demo.screenOf(snap.head.target!))!;
  await page.mouse.click(at.x, at.y);
  await expect(log).toContainText("1 / 6");
  await expect(log.locator("li.now")).toContainText("새 별 띄우기");

  // Mission 6 out of order: push.
  await page.getByRole("button", { name: /Push/ }).click();
  await demo.toast("원격에 올렸어요");
  await expect(log).toContainText("2 / 6");
  await expect(log.locator("li.done")).toHaveCount(2);

  // Closed, it stays closed after a reload; the demo badge brings it back with progress kept.
  await log.getByRole("button", { name: "닫기" }).click();
  await expect(log).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".topbar")).toContainText("ddugit-demo");
  await expect(log).toHaveCount(0);
  await page.getByRole("button", { name: /데모 모드/ }).click();
  await expect(log).toContainText("2 / 6");
});

test("resting the pointer on a star shows a preview card of the commit", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const tip = snap.refs.find((r) => r.kind === "local" && r.name === "feature/theme")!.target;
  const commit = snap.commits.find((c) => c.id === tip)!;
  const at = (await demo.screenOf(tip))!;
  await page.mouse.move(at.x, at.y);
  const card = page.locator(".stage-graph .peek");
  await expect(card).toContainText(commit.summary);
  await expect(card).toContainText(commit.id.slice(0, 7));
  await expect(card.locator(".peek-files li").first()).toBeVisible();
  // Its pull request rides along.
  await expect(card).toContainText("#12");

  // Moving off the star (or clicking it) puts the card away.
  await page.mouse.move(at.x, at.y + 200);
  await expect(card).toHaveCount(0);
});
