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
    .getByRole("button", { name: /^모두 (현재|들어오는)/ })
    .first()
    .click();
  await expect(nebula).not.toHaveClass(/\bon\b/);
});

test("keeps the diff and the conflict sheet usable in a small window", async ({ demo }) => {
  const { page } = demo;
  await page.setViewportSize({ width: 1024, height: 680 });
  // Beside the composer the diff takes the stage's whole width, the file list above it.
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.locator(".composer .path").first().click();
  const stage = (await page.locator(".stage").boundingBox())!;
  const body = (await page.locator(".diff-sheet .diff-body").boundingBox())!;
  expect(body.width).toBeGreaterThan(stage.width - 2);
  await page.keyboard.press("Escape");
  await expect(page.locator(".diff-sheet")).toHaveCount(0);

  await demo.mutate((d) => (d.conflictNext = true));
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 병합");
  await page.click(".dialog button.primary");
  await expect(page.locator(".conflict-sheet")).toBeVisible();
  // The banner says it; no toast over the blocks.
  await expect(page.locator(".toast")).toHaveCount(0);
  // Blocks keep their code instead of collapsing to their header row.
  const block = page.locator(".block").first();
  const head = (await block.locator(".block-head").boundingBox())!;
  expect((await block.boundingBox())!.height).toBeGreaterThan(head.height + 30);
  // The graph above is short: the overview strip and the help line step aside.
  await expect(page.locator(".stage-graph .minimap")).toBeHidden();
  await expect(page.locator(".stage-graph .hint")).toBeHidden();
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
  await page.click(".context-menu >> text=이후 커밋 정리");

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
  await demo.confirmSync();
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
  await demo.confirmSync();
  const dialog = page.locator(".dialog", { hasText: "Push 거부됨" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /덮어쓰기/ }).click();
  await demo.toast("원격을 내 이력으로 덮어썼어요");
  const snap = await demo.snapshot();
  const upstream = snap.refs.find((r) => r.kind === "remote" && r.name === snap.head.upstream)!;
  expect(upstream.target).toBe(snap.head.target);
});

test("asks before pull and push, lists what moves, and can stop asking", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const ahead = before.head.ahead;
  await page.locator(".topbar button", { hasText: "Push" }).click();
  const ask = page.getByRole("dialog", { name: "Push" });
  await expect(ask).toContainText(before.head.upstream!);
  await expect(ask.locator(".sync-commits li")).toHaveCount(ahead);
  // Cancel: nothing left.
  await ask.getByRole("button", { name: "취소" }).click();
  expect((await demo.snapshot()).head.ahead).toBe(ahead);

  // Fetch only reads: it runs without asking.
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");

  // Pull lists what comes in; "don't ask again" sticks.
  await page.locator(".topbar button", { hasText: "Pull" }).click();
  const pull = page.getByRole("dialog", { name: "Pull" });
  await expect(pull.locator(".sync-commits li")).not.toHaveCount(0);
  await pull.getByLabel(/다시 묻지 않기/).check();
  await pull.locator("button.primary").click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!).confirmRemote.pull)).toBe(
    false,
  );
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
  // Mouse gestures read as words, not keys.
  await expect(dialog.locator(".gesture", { hasText: "우클릭" })).toBeVisible();

  await dialog.getByRole("tab", { name: "화면" }).click();
  await dialog.getByLabel(/반짝임 효과/).uncheck();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!).animate)).toBe(false);
  // The space backdrop and the glow switch off on their own (the graph keeps drawing).
  await dialog.getByLabel(/우주 배경/).uncheck();
  await dialog.getByLabel(/빛 번짐/).uncheck();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.settings")!))).toMatchObject({
    space: false,
    glow: false,
  });

  await dialog.getByRole("tab", { name: "Git" }).click();
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

test("turns the graph a quarter at a time and keeps commits, arrows and the setting with it", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const head = snap.commits.find((c) => c.id === snap.head.target)!;
  const parent = snap.commits.find((c) => c.id === head.parents[0])!;
  const turn = page.locator(".hud button.turn");
  await expect(turn).toContainText("0°");

  // 270°: time runs up the screen, so the parent sits below HEAD on the same column.
  for (const deg of ["90°", "180°", "270°"]) {
    await turn.click();
    await expect(turn).toContainText(deg);
  }
  await expect(page.locator(".graph.upright")).toHaveCount(1);
  const h = (await demo.screenOf(head.id))!;
  const p = (await demo.screenOf(parent.id))!;
  expect(p.y).toBeGreaterThan(h.y + 20);
  expect(Math.abs(p.x - h.x)).toBeLessThan(2);

  // A click still lands on the star, and ↓ now walks to the older commit.
  await page.mouse.click(h.x, h.y);
  const live = page.locator(".graph .sr-only");
  await expect(live).toContainText(head.summary);
  await page.keyboard.press("ArrowDown");
  await expect(live).toContainText(parent.summary);

  // R turns it back round to 0°, and the angle is kept across a reload.
  await page.keyboard.press("r");
  await expect(turn).toContainText("0°");
  await page.keyboard.press("r");
  await expect(turn).toContainText("90°");
  await page.reload();
  await expect(page.locator(".hud button.turn")).toContainText("90°");
});

test("tidies a range with a merge in it: merges stay, commits move only within their line", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const find = (summary: string) => before.commits.find((c) => c.summary === summary)!;
  const base = find("Bump dependencies");
  // origin/feature/graph-zoom's label covers its node: walk there from HEAD by keyboard instead.
  await page
    .locator("canvas")
    .first()
    .click({ position: { x: 40, y: 40 } });
  const live = page.locator(".graph .sr-only");
  for (let i = 0; i < 5; i++) await page.keyboard.press("ArrowLeft"); // HEAD, then four first parents
  await expect(live).toContainText("Bump dependencies");
  await page.keyboard.press("Enter");
  await page.click(".context-menu >> text=이후 커밋 정리");

  // The hotfix merge sits locked between its merged line and the branch's own commits.
  const sheet = page.locator(".rebase-sheet");
  await expect(sheet.locator(".rb-merge")).toContainText("Merge branch 'hotfix/crash'");
  await expect(sheet.locator(".rb-line.side")).toContainText("병합한 갈래");
  const row = (summary: string) => sheet.locator(".rb-list li").filter({ hasText: summary });
  await expect(row("Fix crash on empty repo").getByRole("button", { name: /위로/ })).toBeDisabled();
  await expect(row("Semantic zoom levels").getByRole("button", { name: /위로/ })).toBeDisabled();
  // Folding the first commit after the merge into it is refused; dropping one is fine.
  await row("Semantic zoom levels").locator("select").selectOption("fixup");
  await expect(sheet.locator(".danger-text")).toBeVisible();
  await row("Semantic zoom levels").locator("select").selectOption("pick");
  await row("Minimap").locator("select").selectOption("drop");
  await page.click(".rebase-sheet button.primary");
  await demo.toast("커밋을 정리했어요");

  const snap = await demo.snapshot();
  const now = new Map(snap.commits.map((c) => [c.id, c]));
  const chain = (id: string, n: number) => {
    const out = [];
    for (let c = now.get(id); c && out.length < n; c = now.get(c.parents[0])) out.push(c);
    return out;
  };
  const [tip, zoom, merge] = chain(snap.head.target!, 3);
  expect([tip.summary, zoom.summary, merge.summary]).toEqual([
    "Zoom to cursor",
    "Semantic zoom levels",
    "Merge branch 'hotfix/crash' into main",
  ]);
  expect(merge.parents[0]).toBe(base.id);
  expect(now.get(merge.parents[1])!.summary).toBe("Fix crash on empty repo");
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

test("settings: a commercial license is pasted, shown and removed", async ({ demo }) => {
  const { page } = demo;
  await page.keyboard.press("?");
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByRole("tab", { name: "라이선스" }).click();
  const lic = dialog.locator("section.license");
  await expect(lic).toContainText("ddugit.com 계정으로 로그인해 활성화");
  // Pasting is for air-gapped and site licenses: folded away until asked for.
  await expect(lic.getByLabel("라이선스 붙여 넣기")).toBeHidden();
  await lic.locator(".license-paste summary").click();
  await lic.getByLabel("라이선스 붙여 넣기").fill("not a license");
  await lic.getByRole("button", { name: "라이선스 적용" }).click();
  await expect(lic.locator(".note.warn")).toContainText("not a ddugit license");
  await lic.getByLabel("라이선스 붙여 넣기").fill("DDUGIT1.payload.signature");
  await lic.getByRole("button", { name: "라이선스 적용" }).click();
  await expect(lic).toContainText("Demo Corp");
  await expect(lic).toContainText("2027-10-02까지 나온 버전");
  await lic.getByRole("button", { name: /라이선스 지우기/ }).click();
  await expect(lic).toContainText("ddugit.com 계정으로 로그인해 활성화");
});

test("settings: Pro is activated by signing in on ddugit.com, and the wait can be cancelled", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  await page.getByRole("dialog", { name: "설정" }).getByRole("tab", { name: "라이선스" }).click();
  const lic = page.getByRole("dialog", { name: "설정" }).locator("section.license");
  await lic.getByRole("button", { name: "ddugit.com 계정으로 활성화" }).click();
  await expect(lic.locator(".license-waiting")).toContainText("브라우저에서 로그인을 마치면");
  await lic.getByRole("button", { name: "그만두기" }).click();
  await expect(lic.getByRole("button", { name: "ddugit.com 계정으로 활성화" })).toBeVisible();
  await expect(lic.locator(".note.warn")).toHaveCount(0);

  await lic.getByRole("button", { name: "ddugit.com 계정으로 활성화" }).click();
  await expect(lic.locator(".license-plan")).toContainText("Pro 사용 중");
  await expect(lic).toContainText("월간 구독");
});

test("settings: a lapsed subscription only reminds, and renews once paid", async ({ demo }) => {
  const { page } = demo;
  await demo.mutateQuietly((d) => {
    d.setLicense("lapsedMonthly");
    d.subscription = "lapsed";
  });
  await page.locator(".tabrow-settings").click();
  await page.getByRole("dialog", { name: "설정" }).getByRole("tab", { name: "라이선스" }).click();
  const lic = page.getByRole("dialog", { name: "설정" }).locator("section.license");
  await expect(lic).toContainText("월간 구독");
  await expect(lic.locator(".license-lapsed")).toContainText("기능은 그대로 쓸 수 있어요");
  await lic.getByRole("button", { name: "갱신 확인" }).click();
  await expect(lic.locator(".license-renewal")).toContainText("구독이 끝난 상태");
  await expect(lic.locator(".license-lapsed")).toBeVisible();
  await demo.mutateQuietly((d) => {
    d.subscription = "paid";
  });
  await lic.getByRole("button", { name: "갱신 확인" }).click();
  await expect(lic.locator(".license-renewal")).toContainText("새 기간으로 갱신");
  await expect(lic).toContainText("2099-12-31까지");
  await expect(lic.locator(".license-lapsed")).toHaveCount(0);
});

test("settings: switching to English relabels the app and is remembered", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  const dialog = page.getByRole("dialog", { name: "설정" });
  await dialog.getByLabel("언어").selectOption("en");
  await expect(page.getByRole("dialog", { name: "Settings" })).toContainText("Shortcuts");
  await page.keyboard.press("Escape");
  await expect(page.locator(".topbar")).toContainText("Commit");
  await expect(page.locator(".hint")).toContainText("Drag to pan");
  await page.locator(".topbar").getByText("Commit").click();
  await expect(page.locator(".composer")).toContainText("New commit");
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.locator(".topbar")).toContainText("Demo");
  expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
});

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
  const drawn = () =>
    page.evaluate(
      (id) => (window as unknown as { __ddugit: { screenOf(id: string): unknown } }).__ddugit.screenOf(id),
      tip,
    );
  expect(await drawn()).toBeNull();
  await page.keyboard.press("Control+r");
  await expect.poll(drawn).not.toBeNull();
});

test("clones from a URL, remembers it in the repository menu and stars it", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(
    () => ((window as unknown as { __ddugitDemo: { nextFolder: string } }).__ddugitDemo.nextFolder = "/work"),
  );
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  await dialog.getByPlaceholder("https://github.com/owner/repo.git").fill("https://github.com/acme/rocket.git");
  await dialog.getByRole("button", { name: "고르기…" }).click();
  await expect(dialog).toContainText("→ /work/rocket");
  await dialog.getByRole("button", { name: "복제" }).click();
  await demo.toast("rocket을 복제했어요");

  await page.locator(".tab.on .tab-menu").click();
  const row = page.locator(".repo-menu .recent-list li").filter({ hasText: "/work/rocket" });
  await expect(row).toHaveClass(/on/);
  await row.getByRole("button", { name: "즐겨찾기", exact: true }).click();
  await expect(row.locator(".star")).toHaveAttribute("aria-pressed", "true");
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.recent")!));
  expect(stored[0]).toMatchObject({ path: "/work/rocket", starred: true });
});

test("sets up SSH for a clone inside the app: key, host trust, test", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  const url = dialog.getByPlaceholder("https://github.com/owner/repo.git");
  await url.fill("https://github.com/acme/rocket.git");
  await dialog.getByRole("radio", { name: "SSH" }).click();
  await expect(dialog.locator("input.text").first()).toHaveValue("git@github.com:acme/rocket.git");

  await dialog.locator(".ssh-ready summary").click();
  const ssh = dialog.locator(".ssh-setup");
  await ssh.getByRole("button", { name: "키 만들기" }).click();
  await expect(ssh).toContainText("~/.ssh/id_ed25519");
  await expect(ssh.getByRole("button", { name: /공개키 복사/ })).toBeVisible();
  await ssh.getByRole("button", { name: "서버 확인" }).click();
  await expect(ssh).toContainText("github.com에서 공개한 지문과 일치해요");
  await ssh.getByRole("button", { name: "이 서버 신뢰" }).click();
  await expect(ssh).toContainText("이미 신뢰한 서버예요");
  await ssh.getByRole("button", { name: "연결 확인" }).click();
  await expect(ssh).toContainText("demo로 인증됐어요");

  // Back to HTTPS: the same repository.
  await dialog.getByRole("radio", { name: "HTTPS" }).click();
  await expect(dialog.locator("input.text").first()).toHaveValue("https://github.com/acme/rocket.git");
});

test("clones one of my GitHub repositories by searching for it", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(
    () => ((window as unknown as { __ddugitDemo: { nextFolder: string } }).__ddugitDemo.nextFolder = "/work"),
  );
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  await dialog.getByRole("tab", { name: "GitHub" }).click();
  const list = dialog.getByRole("listbox", { name: "GitHub 저장소" });
  await expect(list.getByRole("option")).toHaveCount(8);
  await expect(dialog).toContainText("github.com에 stella로 로그인돼 있어요");

  await dialog.getByPlaceholder("내 저장소 검색").fill("tele");
  await expect(list.getByRole("option")).toHaveCount(1);
  const row = list.getByRole("option", { name: /orbit-labs\/telemetry/ });
  await expect(row).toContainText("비공개");
  await row.click();
  await expect(row).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("radio", { name: "SSH" }).click();
  await dialog.getByRole("button", { name: "고르기…" }).click();
  await expect(dialog).toContainText("→ /work/telemetry");
  await dialog.getByRole("button", { name: "복제", exact: true }).click();
  await demo.toast("telemetry를 복제했어요");
  // The source and the protocol are remembered for next time.
  expect(
    await page.evaluate(() => [localStorage.getItem("ddugit.cloneSource"), localStorage.getItem("ddugit.forgeProto")]),
  ).toEqual(["github", "ssh"]);
});

test("a self-managed GitLab asks to connect before listing repositories", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /저장소 복제/ })
    .click();
  const dialog = page.locator(".dialog.clone");
  await dialog.getByRole("tab", { name: "GitLab" }).click();
  const host = dialog.getByLabel("서버", { exact: true });
  await expect(host).toHaveValue("gitlab.com");
  await host.fill("https://gitlab.corp.example/");
  await host.press("Enter");
  await expect(dialog.locator(".forge-connect")).toContainText("GitLab에 연결하면 내 저장소를 바로 고를 수 있어요");
  await dialog.getByRole("button", { name: "GitLab 연결" }).click();

  const token = page.getByRole("dialog", { name: "GitLab 연결" });
  await expect(token).toContainText("gitlab.corp.example");
  await token.getByLabel("토큰").fill("glpat-demo");
  await token.getByRole("button", { name: "연결", exact: true }).click();
  await expect(token).toHaveCount(0);
  // The clone dialog stays open and lists the projects on that host.
  await expect(dialog.getByRole("listbox").getByRole("option")).toHaveCount(8);
  await expect(dialog.getByRole("option").first()).toHaveAttribute(
    "title",
    "https://gitlab.corp.example/stella/ddugit-demo.git",
  );
});

test("adds a remote from the GitHub tab, named after the owner", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".sidebar").getByTitle("원격 저장소 추가").click();
  const dialog = page.locator(".dialog.add-remote");
  await dialog.getByRole("tab", { name: "GitHub" }).click();
  await dialog.getByPlaceholder("내 저장소 검색").fill("design");
  await dialog.getByRole("option", { name: /orbit-labs\/design-system/ }).click();
  await expect(dialog.getByLabel("이름", { exact: true })).toHaveValue("orbit-labs");
  await expect(dialog).toContainText("→ https://github.com/orbit-labs/design-system.git");
  await dialog.getByRole("button", { name: "추가하고 가져오기" }).click();
  await demo.toast("orbit-labs에서 브랜치 1개를 가져왔어요");
  await expect(page.locator(".sidebar section.remote-sub").filter({ hasText: "orbit-labs" })).toHaveCount(1);
});

test("creates a new repository in a plain folder", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(
    () => ((window as unknown as { __ddugitDemo: { nextFolder: string } }).__ddugitDemo.nextFolder = "/tmp/not-a-repo"),
  );
  await page.locator(".tab.on .tab-menu").click();
  await page
    .locator(".repo-menu")
    .getByRole("button", { name: /새 저장소 만들기/ })
    .click();
  await demo.toast("새 저장소를 만들었어요");
  await page.locator(".tab.on .tab-menu").click();
  await expect(page.locator(".repo-menu .recent-list li.on")).toContainText("/tmp/not-a-repo");
});

test("opens repositories in tabs and keeps each tab's state", async ({ demo }) => {
  const { page } = demo;
  const tabs = page.locator(".tabbar .tab:not(.tab-home)");
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
  await page.click(".context-menu >> text=여기로 리셋…");
  const dialog = page.getByRole("dialog", { name: "리셋" });
  await dialog.getByText("변경까지 모두 버리기 (hard)").click();
  await expect(dialog).toContainText("커밋하지 않은 변경");
  await dialog.getByRole("button", { name: "리셋" }).click();
  await expect.poll(async () => (await demo.snapshot()).head.target).toBe(grand);
  expect((await demo.snapshot()).changes).toEqual([]);

  // The undone commit is only in the reflog now: rescue it as a branch.
  await page.getByRole("button", { name: "작업 기록 (reflog)" }).click();
  const row = page.locator(".reflog-list li.lost").filter({ hasText: head.slice(0, 7) });
  await row.getByRole("button", { name: "브랜치로 살리기" }).click();
  await page.locator(".dialog input").fill("rescued");
  await page.locator(".dialog button.primary").click();
  await demo.toast("rescued 브랜치로 살렸어요");
  expect((await demo.snapshot()).refs.find((r) => r.name === "rescued")?.target).toBe(head);
  await expect(page.locator(".reflog-list li.lost").filter({ hasText: head.slice(0, 7) })).toHaveCount(0);
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
    (d as unknown as { goneBranches: string[] }).goneBranches = ["feature/theme"];
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
  for (let i = 0; i < 6 && !(await banner.textContent())?.includes("원인 커밋:"); i++) {
    const text = (await banner.textContent()) ?? "";
    const sha = /지금 (\w{7})/.exec(text)![1];
    const idx = line.findIndex((c) => c.startsWith(sha));
    // Commits from the culprit on (newer, lower index) have the bug.
    await banner.getByRole("button", { name: idx <= 4 ? "버그 있음" : "버그 없음" }).click();
    await expect(banner).not.toContainText(`지금 ${sha}`);
  }
  await expect(banner).toContainText(`원인 커밋: ${culprit.slice(0, 7)}`);
  await banner.getByRole("button", { name: "끝내기" }).click();
  await expect(banner).toHaveCount(0);
});

test("traces a file through history and shows who changed each line", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const tip = (await demo.screenOf(snap.head.target!))!;
  await page.mouse.click(tip.x, tip.y);
  const file = page.locator(".inspector .changed li:not(.dir)").first();
  await file.click({ button: "right" });
  await page.click(".context-menu >> text=이 파일이 지나온 커밋 보기");

  const banner = page.locator(".trail-banner");
  await expect(banner).toContainText("바꾼 커밋");
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
  await demo.confirmSync();
  await demo.toast("원격에 올렸어요");
  await expect(launch).toHaveCount(1);
  await expect(launch).toHaveCount(0, { timeout: 5000 });

  // The demo's first fetch brings one commit to origin/main and one to the upstream.
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  await expect(meteors).toHaveCount(2);

  // Sparkles off (in settings): the same moments play nothing.
  await page.locator(".tabrow-settings").click();
  await page
    .getByRole("dialog", { name: "설정" })
    .getByLabel(/반짝임 효과/)
    .uncheck();
  await page.keyboard.press("Escape");
  await expect(meteors).toHaveCount(0, { timeout: 5000 });
  await page.getByRole("button", { name: /Fetch/ }).click();
  await demo.toast("원격 커밋을 가져왔어요");
  await page.getByRole("button", { name: /Push/ }).click();
  await demo.confirmSync();
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
  const open = section.locator(":scope > ul > li");
  // `gh` is logged in (demo): open PRs show without asking, and there is no token to manage.
  await expect(open).toHaveCount(2);
  await expect(open.nth(0)).toContainText("#12");
  await expect(open.nth(1)).toContainText("초안");
  // CI and review state ride along: #12 passed and is approved, #15 failed.
  await expect(open.nth(0).locator(".pr-ci")).toHaveClass(/success/);
  await expect(open.nth(0)).toContainText("승인");
  await expect(open.nth(1).locator(".pr-ci")).toHaveClass(/failure/);
  await expect(section.getByRole("button", { name: "토큰 관리" })).toHaveCount(0);
  // Merged and closed ones sit in their own fold, with no label on the graph.
  const done = section.locator("section.sub");
  await expect(done).toContainText("닫힘·병합");
  await expect(done.locator("li")).toHaveCount(2);
  await expect(done.locator("li").nth(0)).toContainText("병합됨");
  await expect(done.locator("li").nth(1)).toContainText("닫힘");

  await open.nth(0).click({ button: "right" });
  await page.click(".context-menu >> text=feature/theme 브랜치 체크아웃");
  await expect.poll(async () => (await demo.snapshot()).head.branch).toBe("feature/theme");

  // Without a login the section offers to connect; a pasted token is saved and can be forgotten.
  await demo.mutate((d) => (d.forgeToken = "none"));
  await page.getByRole("button", { name: /Fetch/ }).click(); // remote work re-reads pull requests
  await expect(section).toContainText("GitHub에 연결하면");
  await expect(open).toHaveCount(0);
  await section.getByRole("button", { name: "GitHub 연결" }).click();
  const dialog = page.getByRole("dialog", { name: "GitHub 연결" });
  await dialog.getByLabel("토큰").fill("ghp_demo");
  await dialog.getByLabel("토큰").press("Enter");
  await demo.toast("GitHub에 연결했어요");
  await expect(open).toHaveCount(2);

  await section.getByRole("button", { name: "토큰 관리" }).click();
  await dialog.getByRole("button", { name: "저장된 토큰 지우기" }).click();
  await demo.toast("저장된 토큰을 지웠어요");
  await expect(section.getByRole("button", { name: "GitHub 연결" })).toBeVisible();
});

test("the tutorial voyage ticks off missions as they are done, and can be closed and reopened", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => localStorage.setItem("ddugit.voyage", JSON.stringify({ done: [], dismissed: false })));
  await page.reload();
  const log = page.getByRole("complementary", { name: "튜토리얼" });
  await expect(log).toContainText("0 / 6");
  await expect(log.locator("li.now")).toContainText("커밋 살펴보기");

  // Mission 1: look at a commit.
  const snap = await demo.snapshot();
  const at = (await demo.screenOf(snap.head.target!))!;
  await page.mouse.click(at.x, at.y);
  await expect(log).toContainText("1 / 6");
  await expect(log.locator("li.now")).toContainText("커밋하기");

  // Mission 6 out of order: push.
  await page.getByRole("button", { name: /Push/ }).click();
  await demo.confirmSync();
  await demo.toast("원격에 올렸어요");
  await expect(log).toContainText("2 / 6");
  await expect(log.locator("li.done")).toHaveCount(2);

  // Closed, it stays closed after a reload; the demo badge brings it back with progress kept.
  await log.getByRole("button", { name: "닫기" }).click();
  await expect(log).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".tab.on")).toContainText("ddugit-demo");
  await expect(log).toHaveCount(0);
  await page.getByRole("button", { name: /데모/ }).click();
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

test("the galaxy dashboard reads every recent repository and fetches them all", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    const paths = ["/work/rocket", "/work/gone-project", "/srv/api-server"];
    localStorage.setItem("ddugit.recent", JSON.stringify(paths.map((path, i) => ({ path, starred: false, at: i }))));
  });
  await page.reload();
  // The home tab shows the galaxy over the open repository, without a new tab.
  await page.locator(".tab-home").click();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(1);
  const galaxy = page.locator(".welcome .galaxy");
  await expect(galaxy).toContainText("내 저장소 · 3개");
  const worlds = galaxy.locator(".world");
  await expect(worlds).toHaveCount(3);
  await expect(worlds.filter({ hasText: "gone-project" })).toContainText("찾을 수 없음");
  await expect(worlds.filter({ hasText: "rocket" }).locator(".world-branch")).toContainText("origin/");

  // Fetch reaches the two readable ones.
  await galaxy.getByRole("button", { name: /모두 Fetch/ }).click();
  await demo.toast("저장소 2개에서 새 커밋을 가져왔어요");
  await expect(galaxy.locator(".world-fetch.ok")).toHaveCount(2);

  // Forget the missing one, then open a world: it gets its own tab beside the demo.
  await worlds.filter({ hasText: "gone-project" }).getByRole("button", { name: "목록에서 지우기" }).click();
  await expect(worlds).toHaveCount(2);
  await worlds.filter({ hasText: "api-server" }).locator(".world-open").click();
  await expect(page.locator(".app:not([hidden]) .topbar")).toBeVisible();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(2);
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

test("groups repositories on the dashboard: create, move in, open all, ungroup", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    const paths = ["/work/api-gateway", "/work/payments", "/home/me/dotfiles"];
    localStorage.setItem(
      "ddugit.recent",
      JSON.stringify(paths.map((path, i) => ({ path, starred: false, at: 9 - i }))),
    );
  });
  await page.reload();
  await page.locator(".tab-new").click();
  const galaxy = page.locator(".welcome .galaxy");
  await expect(galaxy.locator(".band")).toHaveCount(0);

  await galaxy.getByRole("button", { name: "그룹", exact: true }).click();
  await page.locator(".dialog input.text").fill("결제 플랫폼");
  await page.locator(".dialog").getByRole("button", { name: "만들기" }).click();
  const band = galaxy.locator(".band").filter({ hasText: "결제 플랫폼" });
  await expect(band).toContainText("아직 비어 있어요");

  for (const name of ["api-gateway", "payments"]) {
    await galaxy.locator(".world").filter({ hasText: name }).getByRole("button", { name: "그룹으로 옮기기" }).click();
    await page.getByRole("menuitem", { name: "결제 플랫폼으로 옮기기" }).click();
  }
  await expect(band.locator(".world")).toHaveCount(2);
  await expect(galaxy.locator(".band.ungrouped .world")).toHaveCount(1);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("ddugit.recent")!));
  expect(stored.filter((r: { group?: string }) => r.group).length).toBe(2);

  // Fold and unfold, then open the whole group as tabs.
  await band.locator(".fold").click();
  await expect(band.locator(".world")).toHaveCount(0);
  await band.locator(".fold").click();
  await band.getByRole("button", { name: "모두 열기" }).click();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(3);

  // Ungrouping keeps the repositories.
  await page.locator(".tabbar .tab-new").click();
  await galaxy
    .locator(".band")
    .filter({ hasText: "결제 플랫폼" })
    .getByRole("button", { name: "결제 플랫폼 메뉴" })
    .click();
  await page.getByRole("menuitem", { name: /그룹 해제/ }).click();
  await expect(galaxy.locator(".band")).toHaveCount(0);
  await expect(galaxy.locator(".world")).toHaveCount(3);
});

test("groups: a suggestion by owner, picking several cards, and dragging between bands", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    const paths = ["/work/acme-main", "/work/acme-patches", "/home/me/dotfiles", "/srv/tools/lint"];
    localStorage.setItem(
      "ddugit.recent",
      JSON.stringify(paths.map((path, i) => ({ path, starred: false, at: 9 - i }))),
    );
  });
  await page.reload();
  await page.locator(".tab-new").click();
  const galaxy = page.locator(".welcome .galaxy");

  // The two acme repositories are offered as a group.
  await expect(galaxy.locator(".group-hint")).toContainText("acme 저장소 2개를 한 그룹으로 묶을까요?");
  await galaxy.locator(".group-hint").getByRole("button", { name: "묶기" }).click();
  const acme = galaxy.locator(".band").filter({ hasText: "acme" }).first();
  await expect(acme.locator(".world")).toHaveCount(2);
  await expect(galaxy.locator(".group-hint")).toHaveCount(0);

  // Ctrl+click picks cards instead of opening them; the bar moves them together.
  for (const name of ["dotfiles", "lint"])
    await galaxy
      .locator(".world")
      .filter({ hasText: name })
      .locator(".world-open")
      .click({ modifiers: ["Control"] });
  await expect(galaxy.locator(".pick-bar")).toContainText("2개 선택");
  await galaxy.locator(".pick-bar").getByRole("button", { name: "acme로 옮기기" }).click();
  await expect(acme.locator(".world")).toHaveCount(4);
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(2);

  // Drag a card out to the (now empty) ungrouped band.
  const loose = galaxy.locator(".band.ungrouped");
  await expect(loose).toContainText("그룹에 넣지 않은 저장소");
  await galaxy.locator(".world").filter({ hasText: "lint" }).dragTo(loose);
  await expect(acme.locator(".world")).toHaveCount(3);
  await expect(loose.locator(".world")).toHaveCount(1);
});

test("groups show in the repository menu, and grouped tabs carry the group's colour", async ({ demo }) => {
  const { page } = demo;
  await page.evaluate(() => {
    localStorage.setItem("ddugit.groups", JSON.stringify([{ id: "pay", name: "결제 플랫폼", hue: 190 }]));
    const recent = [
      { path: "/work/api-gateway", group: "pay" },
      { path: "/work/payments", group: "pay" },
      { path: "/home/me/dotfiles" },
    ];
    localStorage.setItem("ddugit.recent", JSON.stringify(recent.map((r, i) => ({ ...r, starred: false, at: 9 - i }))));
  });
  await page.reload();
  await page.locator(".tab.on .tab-menu").click();
  const menu = page.locator(".repo-menu");
  const group = menu.locator(".recent-groups section").filter({ hasText: "결제 플랫폼" });
  await expect(group.locator(".recent-list li")).toHaveCount(2);
  await expect(menu.locator(".recent-groups section").filter({ hasText: "미분류" })).toContainText("dotfiles");
  await group.getByRole("button", { name: "모두 열기" }).click();
  await expect(page.locator(".tabbar .tab:not(.tab-home)")).toHaveCount(3);
  await expect(page.locator(".tabbar .tab.grouped")).toHaveCount(2);
  await expect(page.locator(".tabbar .tab.grouped").first()).toHaveAttribute("title", /^결제 플랫폼 · /);
});

test("a backported commit that is already there stops as empty and is skipped, not sent to the conflict sheet", async ({
  demo,
}) => {
  const { page } = demo;
  await demo.mutateQuietly((d) => ((d as unknown as { emptyNext: boolean }).emptyNext = true));
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

test("the original project added as a remote is fetch-only: a push offers origin instead", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".sidebar").getByTitle("원격 저장소 추가").click();
  await page.fill(".dialog input >> nth=0", "upstream");
  await page.fill(".dialog input >> nth=1", "https://example.com/original.git");
  await page.click(".dialog button.primary");
  await demo.toast("upstream을 가져오기 전용으로 추가했어요. 이 원격에는 push하지 않아요");
  const upstream = page.locator(".sidebar section.remote-sub").filter({ hasText: "upstream" });
  await expect(upstream.locator(".fetch-only")).toBeVisible();

  // A branch that follows upstream/main.
  await upstream
    .locator("li")
    .filter({ hasText: /^main$/ })
    .dblclick();
  await page.locator(".dialog").getByRole("button", { name: "만들고 이동" }).click();
  await demo.toast(/upstream\/main을 로컬로/);
  expect((await demo.snapshot()).head.upstream).toBe("upstream/main");

  await page.locator(".topbar").getByRole("button", { name: /Push/ }).click();
  const ask = page.locator(".dialog.sync-confirm");
  await expect(ask).toContainText("가져오기 전용 원격이라 올리지 않아요");
  await expect(ask.getByRole("button", { name: /^Push/ })).toBeDisabled();
  await ask.getByRole("button", { name: "origin에 올리기" }).click();
  await demo.toast(/origin에 올렸어요/);
  expect((await demo.snapshot()).head.upstream).toBe("origin/upstream-main");
});

test("a remote can be disconnected from its menu, even the only one", async ({ demo }) => {
  const { page } = demo;
  const origin = page.locator(".sidebar section.remote-sub").filter({ hasText: "origin" });
  await origin.getByRole("button", { name: "origin 메뉴" }).click();
  await page.getByRole("menuitem", { name: "원격 origin 삭제…" }).click();
  await page.locator(".dialog").getByRole("button", { name: "삭제" }).click();
  await demo.toast("원격 origin을 삭제했어요");
  await expect(page.locator(".sidebar section.remote-sub")).toHaveCount(0);
  expect((await demo.snapshot()).remotes).toEqual([]);
});

test("several branches can be picked in the sidebar, lighting their histories together", async ({ demo }) => {
  const { page } = demo;
  const side = page.locator(".app:not([hidden]) .sidebar");
  const branch = (name: string) =>
    side
      .locator("li")
      .filter({ hasText: new RegExp(`^${name}`) })
      .first();
  // Each plain click adds a branch; clicking a picked one again takes only that one out.
  await branch("feature/login").click();
  await expect(side.locator("li.focused")).toHaveCount(1);
  await branch("hotfix/crash").click();
  await branch("feature/theme").click();
  await expect(side.locator("li.focused")).toHaveCount(3);
  await expect(side.locator(".side-picked")).toContainText("브랜치 3개의 이력 강조 중");
  await branch("hotfix/crash").click();
  await expect(side.locator("li.focused")).toHaveCount(2);
  await expect(branch("feature/login")).toHaveClass(/focused/);
  await branch("feature/login").click();
  await branch("feature/theme").click();
  await expect(side.locator("li.focused")).toHaveCount(0);
  await branch("main").click();
  await branch("feature/login").click();
  await side.getByRole("button", { name: "선택 해제" }).click();
  await expect(side.locator("li.focused")).toHaveCount(0);
});

test("a newer version shows an update notice that installs or waits", async ({ demo }) => {
  const { page } = demo;
  await expect(page.locator(".update-notice")).toHaveCount(0);
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__ddugitDemoUpdate = { version: "9.9.9", notes: null };
  });
  await page.reload();
  const notice = page.locator(".update-notice");
  await expect(notice).toContainText("9.9.9");
  // It sits above the topbar instead of over its actions.
  const box = (await notice.boundingBox())!;
  const push = (await page.locator(".topbar button", { hasText: "Push" }).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(push.y);
  await notice.locator("button.ghost").click();
  await expect(notice).toHaveCount(0);
  await page.reload();
  await page.locator(".update-notice button.primary").click();
  await expect(page.locator(".update-notice")).toHaveCount(0);
});

test("on Free, private pull requests and backport actions offer Pro instead", async ({ demo }) => {
  const { page } = demo;
  await page.locator(".tabrow-settings").click();
  await page.getByRole("dialog", { name: "설정" }).getByRole("tab", { name: "라이선스" }).click();
  await expect(page.locator(".license-plan")).toContainText("Pro 체험 중 · 12일 남음");
  await page.keyboard.press("Escape");
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__ddugitDemoPro = { pro: false, source: "free", trialDaysLeft: 0 };
  });
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
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__ddugitDemoPro = { pro: false, source: "free", trialDaysLeft: 0 };
  });
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
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__ddugitDemoPro = { pro: false, source: "free", trialDaysLeft: 0 };
  });
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
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__ddugitDemoPro = { pro: false, source: "free", trialDaysLeft: 0 };
  });
  await page.reload();
  await page.click(".sidebar li >> text=v0.2.0", { button: "right" });
  await page.click(".context-menu >> text=여기까지 릴리스 노트 만들기");
  await expect(page.locator(".dialog.pro-offer")).toContainText("릴리스 노트");
});

test("the dashboard pulls picked repositories and puts them all on the same branch", async ({ demo }) => {
  const { page } = demo;
  // nova is behind its upstream, comet has diverged, rocket is stopped mid-merge.
  const names = ["nova", "comet", "rocket"];
  await page.evaluate((names) => {
    const recent = names.map((n, i) => ({ path: `/work/${n}`, starred: false, at: i }));
    localStorage.setItem("ddugit.recent", JSON.stringify(recent));
  }, names);
  await page.reload();
  await page.locator(".tab-home").click();
  const galaxy = page.locator(".welcome .galaxy");
  const world = (name: string) => galaxy.locator(".world").filter({ hasText: `/work/${name}` });
  for (const name of names)
    await world(name)
      .locator(".world-open")
      .click({ modifiers: ["ControlOrMeta"] });
  const bar = galaxy.locator(".pick-bar");
  await expect(bar).toContainText("3개");

  // Pull fast-forwards what it can; the diverged one is marked, the stopped one left out.
  await bar.getByRole("button", { name: /Pull/ }).click();
  await demo.toast("1개는 Pull했고 1개는 못 했어요. 카드에 표시했어요");
  await expect(world("nova").locator(".world-fetch")).toHaveClass(/ok/);
  await expect(world("comet").locator(".world-fetch")).toContainText("갈라짐");
  await expect(world("rocket").locator(".world-fetch")).toHaveCount(0);

  await bar.getByRole("button", { name: /브랜치…/ }).click();
  await page.locator(".dialog input.text").fill("release/3.0");
  await page.keyboard.press("Enter");
  await demo.toast("저장소 2개를 release/3.0으로 전환했어요");
  for (const name of ["nova", "comet"]) await expect(world(name).locator(".world-branch")).toContainText("release/3.0");
  await expect(world("rocket").locator(".world-branch")).not.toContainText("release/3.0");
});

test("on Free, batch pull and branch switching offer Pro", async ({ demo }) => {
  const { page } = demo;
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>).__ddugitDemoPro = { pro: false, source: "free", trialDaysLeft: 0 };
    localStorage.setItem("ddugit.recent", JSON.stringify([{ path: "/work/nova", starred: false, at: 0 }]));
  });
  await page.reload();
  await page.locator(".tab-home").click();
  await page.locator(".welcome .galaxy .world .world-open").click({ modifiers: ["ControlOrMeta"] });
  await page
    .locator(".pick-bar")
    .getByRole("button", { name: /브랜치…/ })
    .click();
  await expect(page.locator(".dialog.pro-offer")).toContainText("여러 저장소");
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
