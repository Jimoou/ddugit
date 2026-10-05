// Moving and rewriting history: merges, conflicts, interactive rebase, undo, bisect, file history and cherry-pick.

import { expect, test } from "./fixtures";

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
