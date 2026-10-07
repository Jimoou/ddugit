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

test("a merge stopped on conflicts is cancelled from its banner, and a resolved one ends with a commit", async ({
  demo,
}) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const theirs = before.refs.find((r) => r.kind === "local" && r.name === "feature/theme")!.target;
  const mergeTheme = async () => {
    await demo.mutate((d) => (d.conflictNext = true));
    await page.click(".sidebar li >> text=feature/theme", { button: "right" });
    await page.click(".context-menu >> text=에 병합");
    await page.click(".dialog button.primary");
    await expect(page.locator(".conflict-sheet")).toBeVisible();
  };
  const banner = page.locator(".banner", { hasText: "진행 중" });

  await mergeTheme();
  await expect(banner).toContainText("병합 진행 중 — 충돌 파일 2개");
  // A merge is finished by committing: no "continue" or "skip" here.
  await expect(banner.getByRole("button", { name: "계속" })).toHaveCount(0);
  await expect(banner.getByRole("button", { name: "건너뛰기" })).toHaveCount(0);
  await banner.getByRole("button", { name: "취소" }).click();
  await demo.toast("취소했어요");
  await expect(banner).toHaveCount(0);
  // Nothing is left to resolve: the conflict sheet goes too (it would hide every other sheet).
  await expect(page.locator(".conflict-sheet")).toHaveCount(0);
  let snap = await demo.snapshot();
  expect(snap.state).toBe("clean");
  expect(snap.head.target).toBe(before.head.target);
  expect(snap.changes.map((c) => c.path)).toEqual(before.changes.map((c) => c.path));

  // Again, this time resolved: the banner says to commit, and the commit joins both sides.
  await mergeTheme();
  const resolveAll = page.getByRole("button", { name: /^모두 (현재|들어오는)/ }).first();
  await resolveAll.click();
  await expect(page.locator(".conflict-sheet header")).toContainText("남은 파일 1개");
  await resolveAll.click();
  await expect(banner).not.toContainText("충돌 파일");
  await expect(banner).toContainText("해결한 뒤 ＋로 커밋하면 병합이 끝나요");
  await page.keyboard.press("Escape");
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  await page.fill("textarea.message", "Merge feature/theme");
  await page.keyboard.press("Control+Enter");
  await demo.toast("커밋했어요");
  await expect(banner).toHaveCount(0);
  snap = await demo.snapshot();
  expect(snap.commits.find((c) => c.id === snap.head.target)!.parents).toEqual([before.head.target, theirs]);
});

test("a cherry-pick stopped on conflicts goes on from its banner", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const main = before.refs.find((r) => r.kind === "local" && r.name === "main")!.target;
  const summary = before.commits.find((c) => c.id === main)!.summary;
  await demo.mutate((d) => (d.conflictNext = true));
  await (await demo.commitMenu(main)).getByText(/에 cherry-pick$/).click();
  await page.click(".dialog button.primary");
  await expect(page.locator(".conflict-sheet")).toBeVisible();
  const banner = page.locator(".banner", { hasText: "진행 중" });
  await expect(banner).toContainText("cherry-pick 진행 중 — 충돌 파일 2개");
  expect((await demo.snapshot()).incoming).toBe(main);

  await page.keyboard.press("Escape");
  await banner.getByRole("button", { name: "계속" }).click();
  await demo.toast("이어서 마쳤어요");
  await expect(banner).toHaveCount(0);
  const snap = await demo.snapshot();
  const tip = snap.commits.find((c) => c.id === snap.head.target)!;
  expect([tip.summary, tip.parents]).toEqual([summary, [before.head.target]]);
  expect(snap.state).toBe("clean");
  expect(snap.changes.some((c) => c.conflicted)).toBe(false);
});

test("reverts a commit from its menu", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const target = before.commits.find((c) => c.id === before.head.target)!.parents[0];
  const summary = before.commits.find((c) => c.id === target)!.summary;
  await (await demo.commitMenu(target)).getByText("되돌리는 커밋 만들기 (revert)").click();
  const dialog = page.getByRole("dialog", { name: "revert" });
  await expect(dialog).toContainText(`“${summary}”의 변경을 거꾸로 적용하는 새 커밋을 feature/graph-zoom에 만들어요`);
  await dialog.getByRole("button", { name: "되돌리는 커밋 만들기" }).click();
  await demo.toast("되돌리는 커밋을 만들었어요");
  const snap = await demo.snapshot();
  const tip = snap.commits.find((c) => c.id === snap.head.target)!;
  expect([tip.summary, tip.parents]).toEqual([`Revert "${summary}"`, [before.head.target]]);
});

test("Alt-dragging a commit onto a branch tip cherry-picks it there", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const source = before.refs.find((r) => r.kind === "local" && r.name === "feature/theme")!.target;
  const a = (await demo.screenOf(source))!;
  const z = (await demo.screenOf(before.head.target!))!;
  await page.keyboard.down("Alt");
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 30, a.y - 20, { steps: 6 });
  await page.mouse.move(z.x, z.y, { steps: 12 });
  await expect(page.locator(".drag-hint")).toContainText("놓으면 이 커밋을 복사(cherry-pick)해요");
  await page.mouse.up();
  await page.keyboard.up("Alt");

  const dialog = page.getByRole("dialog", { name: "cherry-pick" });
  await expect(dialog).toContainText("Tune particle speed");
  await dialog.getByRole("button", { name: "복사" }).click();
  await demo.toast("feature/graph-zoom에 복사했어요");
  const snap = await demo.snapshot();
  const tip = snap.commits.find((c) => c.id === snap.head.target)!;
  expect([tip.summary, tip.parents]).toEqual(["Tune particle speed", [before.head.target]]);
  // Not a merge: the source branch is left alone.
  expect(snap.refs.find((r) => r.name === "feature/theme")!.target).toBe(
    before.refs.find((r) => r.name === "feature/theme")!.target,
  );
});

test("skips a commit that can't be tested while bisecting", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.grow(7));
  const snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  const line: string[] = [];
  for (let c: string | undefined = snap.head.target!; c && line.length < 8; c = byId.get(c)?.parents[0]) line.push(c);
  await expect.poll(async () => (await demo.screenOf(line[0])) !== null).toBe(true);
  // Mark the ends by keyboard: the first arrow picks HEAD, each next one its parent.
  const canvas = page.locator(".app:not([hidden]) .graph-area canvas");
  const live = page.locator(".graph .sr-only");
  const mark = async (steps: number, label: string, summary: string) => {
    await canvas.focus();
    for (let i = 0; i < steps; i++) await page.keyboard.press("ArrowLeft");
    await expect(live).toContainText(summary);
    await page.keyboard.press("Enter");
    await page.locator(".context-menu").getByText(label).click();
  };
  await mark(1, "버그가 있는 커밋으로 표시", byId.get(line[0])!.summary);
  await mark(7, "버그가 없는 커밋으로 표시", byId.get(line[7])!.summary);
  await demo.toast("버그 찾기를 시작했어요");

  const banner = page.locator(".bisect-banner");
  await expect(banner).toContainText("후보 7개");
  const probe = /지금 (\w{7})/.exec((await banner.textContent()) ?? "")![1];
  await banner.getByRole("button", { name: "건너뛰기" }).click();
  await demo.toast("건너뛰었어요");
  // The skipped commit leaves the candidates, and another one is up for testing.
  await expect(banner).toContainText("후보 6개");
  await expect(banner).not.toContainText(`지금 ${probe}`);
  await expect(banner).toContainText(/지금 \w{7}/);
  await banner.getByRole("button", { name: "끝내기" }).click();
  await demo.toast("버그 찾기를 끝내고 원래 브랜치로 돌아왔어요");
});

test("a tidy-up stopped on conflicts names the sides for a rebase, and goes on or is cancelled", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => d.grow(3));
  const before = await demo.snapshot();
  const byId = new Map(before.commits.map((c) => [c.id, c]));
  let base = before.head.target!;
  for (let i = 0; i < 3; i++) base = byId.get(base)!.parents[0];
  const tidy = async () => {
    await demo.mutateQuietly((d) => (d.conflictNext = true));
    await (await demo.commitMenu(base)).getByText("이후 커밋 정리").click();
    const rows = page.locator(".rb-list li");
    await expect(rows).toHaveCount(3);
    await rows.nth(2).dragTo(rows.nth(0));
    await expect(rows.nth(0)).toContainText("Step 3 of 3");
    await page.click(".rebase-sheet button.primary");
    await expect(page.locator(".conflict-sheet")).toBeVisible();
  };
  const banner = page.locator(".banner", { hasText: "진행 중" });

  await tidy();
  await expect(banner).toContainText("리베이스 진행 중 — 충돌 파일 2개");
  // During a rebase git's "ours" is the branch being rebased onto: the sides say so.
  const sheet = page.locator(".conflict-sheet");
  await expect(sheet.locator("header").getByRole("button", { name: "모두 기준 브랜치" })).toBeVisible();
  await expect(sheet.locator("header").getByRole("button", { name: "모두 내 커밋" })).toBeVisible();
  await expect(sheet.locator(".block").first().getByRole("button", { name: "내 커밋" })).toBeVisible();
  await banner.getByRole("button", { name: "취소" }).click();
  await demo.toast("취소했어요");
  expect((await demo.snapshot()).head.target).toBe(before.head.target);

  await tidy();
  await page.keyboard.press("Escape");
  await banner.getByRole("button", { name: "계속" }).click();
  await demo.toast("이어서 마쳤어요");
  const snap = await demo.snapshot();
  const now = new Map(snap.commits.map((c) => [c.id, c]));
  const head = now.get(snap.head.target!)!;
  expect(head.summary).toBe("Step 2 of 3");
  expect(now.get(now.get(head.parents[0])!.parents[0])!.summary).toBe("Step 3 of 3");
  expect(snap.state).toBe("clean");
});

test("a binary file in conflict is resolved by picking a whole side", async ({ demo }) => {
  const { page } = demo;
  await demo.mutate((d) => {
    d.conflictNext = true;
    d.binaryConflict = true;
  });
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 병합");
  await page.click(".dialog button.primary");
  const sheet = page.locator(".conflict-sheet");
  await expect(sheet.locator("header")).toContainText("남은 파일 3개");
  await sheet.locator(".file-list li", { hasText: "assets/logo.png" }).click();
  const body = sheet.locator(".conflict-body");
  await expect(body).toContainText("바이너리 파일이라 내용을 비교할 수 없어요. 한쪽을 고르세요.");
  // No blocks to merge line by line, and no "whole file" buttons in the header: just the two sides.
  await expect(body.locator(".block")).toHaveCount(0);
  await expect(sheet.locator("header").getByRole("button", { name: /^모두/ })).toHaveCount(0);
  await body.getByRole("button", { name: "들어오는 변경" }).click();
  await expect(sheet.locator("header")).toContainText("남은 파일 2개");
  const logo = (await demo.snapshot()).changes.find((c) => c.path === "assets/logo.png")!;
  expect(logo.conflicted).toBe(false);
});

test("rebases the current branch onto another from the branch menu, saying what it rewrites", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const main = before.refs.find((r) => r.kind === "local" && r.name === "main")!.target;
  const local = (name: RegExp) => page.locator(".app:not([hidden]) .sidebar li").filter({ hasText: name }).first();
  await local(/^main$/).click({ button: "right" });
  await page.getByRole("menuitem", { name: "main 위로 feature/graph-zoom 다시 쌓기 (rebase)…" }).click();
  const ask = page.getByRole("dialog", { name: "다른 브랜치 위로 rebase" });
  await expect(ask).toContainText("커밋 3개를 main의 끝 위로");
  await expect(ask).toContainText("잠시 치워"); // the demo has local edits
  await expect(ask).not.toContainText("병합 커밋");
  await ask.getByRole("button", { name: "rebase" }).click();
  await demo.toast(/main 위로 다시 쌓았어요/);
  const snap = await demo.snapshot();
  const byId = new Map(snap.commits.map((c) => [c.id, c]));
  const chain = [snap.head.target!];
  for (let i = 0; i < 3; i++) chain.push(byId.get(chain[i])!.parents[0]);
  expect(chain.slice(0, 3).map((id) => byId.get(id)!.summary)).toEqual([
    "Zoom to cursor",
    "Minimap",
    "Semantic zoom levels",
  ]);
  expect(chain[3]).toBe(main);

  // feature/theme has a merge from main among its own commits, and it is pushed.
  await local(/^feature\/theme$/).dblclick();
  await expect.poll(async () => (await demo.snapshot()).head.branch).toBe("feature/theme");
  await local(/^main$/).click({ button: "right" });
  await page.getByRole("menuitem", { name: /^main 위로 feature\/theme 다시 쌓기/ }).click();
  await expect(ask).toContainText("병합 커밋 1개");
  await expect(ask).toContainText("강제 push");
  await ask.getByRole("button", { name: "취소" }).click();
  // Onto a branch it already contains: nothing to do, so the entry is off.
  await local(/^hotfix\/crash$/).click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: /^hotfix\/crash 위로/ })).toBeDisabled();
});

test("a rebase onto another branch stopped on conflicts is cancelled from its banner", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  await demo.mutate((d) => (d.conflictNext = true));
  await page
    .locator(".app:not([hidden]) .sidebar li")
    .filter({ hasText: /^main$/ })
    .first()
    .click({ button: "right" });
  await page.getByRole("menuitem", { name: /^main 위로 feature\/graph-zoom/ }).click();
  await page.getByRole("dialog").getByRole("button", { name: "rebase" }).click();
  await expect(page.locator(".conflict-sheet")).toBeVisible();
  const banner = page.locator(".banner", { hasText: "진행 중" });
  await expect(banner).toContainText("리베이스 진행 중 — 충돌 파일 2개");
  await banner.getByRole("button", { name: "취소" }).click();
  await demo.toast("취소했어요");
  const snap = await demo.snapshot();
  expect(snap.state).toBe("clean");
  expect(snap.head.target).toBe(before.head.target);
});

test("rebases by dragging the current branch's tip onto another tip with ⌘/Ctrl", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  const main = before.refs.find((r) => r.kind === "local" && r.name === "main")!.target;
  const a = (await demo.screenOf(before.head.target!))!;
  const z = (await demo.screenOf(main))!;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.keyboard.down("Control");
  await page.mouse.move(a.x + 40, a.y + 10, { steps: 8 });
  await page.mouse.move(z.x, z.y, { steps: 12 });
  await expect(page.locator(".drag-hint")).toHaveText("놓으면 그 브랜치 위로 rebase해요");
  await page.mouse.up();
  await page.keyboard.up("Control");
  await page.getByRole("dialog", { name: "다른 브랜치 위로 rebase" }).getByRole("button", { name: "rebase" }).click();
  await demo.toast(/main 위로 다시 쌓았어요/);
  const snap = await demo.snapshot();
  expect(snap.head.branch).toBe("feature/graph-zoom");
  expect(snap.head.target).not.toBe(before.head.target);
});

test("merges with its own message, by fast-forward, or as a squash for the composer", async ({ demo }) => {
  const { page } = demo;
  const sidebar = page.locator(".app:not([hidden]) .sidebar");
  const dialog = page.getByRole("dialog", { name: "병합" });
  const before = await demo.snapshot();
  const theme = before.refs.find((r) => r.name === "feature/theme" && r.kind === "local")!.target;

  // Its own message on a merge commit.
  await sidebar
    .locator("li")
    .filter({ hasText: /^feature\/theme$/ })
    .first()
    .click({ button: "right" });
  await page.click(".context-menu >> text=에 병합");
  await dialog.locator("textarea").fill("Bring in the neon theme");
  await dialog.getByRole("button", { name: "병합", exact: true }).click();
  await demo.toast(/병합했어요/);
  let snap = await demo.snapshot();
  let head = snap.commits.find((c) => c.id === snap.head.target)!;
  expect(head.summary).toBe("Bring in the neon theme");
  expect(head.parents).toEqual([before.head.target, theme]);

  // Fast-forward main to a teammate's branch that is ahead of it: no merge commit, no message field.
  await sidebar
    .locator("li")
    .filter({ hasText: /^main$/ })
    .first()
    .dblclick();
  await expect.poll(async () => (await demo.snapshot()).head.branch).toBe("main");
  const orbit = snap.refs.find((r) => r.name === "origin/feature/orbit-sync")!.target;
  await sidebar
    .locator("section.remote-sub")
    .filter({ hasText: "origin" })
    .locator("li")
    .filter({ hasText: /orbit-sync/ })
    .click({ button: "right" });
  await page.click(".context-menu >> text=에 병합");
  await dialog.getByRole("radio", { name: "fast-forward" }).click();
  await expect(dialog).toContainText("앞으로 옮겨요");
  await expect(dialog.locator("textarea")).toHaveCount(0);
  await dialog.getByRole("button", { name: "병합", exact: true }).click();
  await demo.toast(/병합했어요/);
  expect((await demo.snapshot()).head.target).toBe(orbit);

  // Squash: the changes are staged and the composer opens with a message listing the commits.
  await sidebar
    .locator("li")
    .filter({ hasText: /^feature\/theme$/ })
    .first()
    .click({ button: "right" });
  await page.click(".context-menu >> text=에 병합");
  // The last choice is offered first.
  await expect(dialog.getByRole("radio", { name: "fast-forward" })).toHaveAttribute("aria-checked", "true");
  await dialog.getByRole("radio", { name: "squash" }).click();
  // Not over uncommitted work: going back from a squash's conflicts would take it along.
  await dialog.getByRole("button", { name: "스테이지" }).click();
  await demo.toast("Commit or stash your changes before a squash merge");
  await demo.mutate((d) => d.clean());
  await sidebar
    .locator("li")
    .filter({ hasText: /^feature\/theme$/ })
    .first()
    .click({ button: "right" });
  await page.click(".context-menu >> text=에 병합");
  await dialog.getByRole("radio", { name: "squash" }).click();
  await dialog.getByRole("button", { name: "스테이지" }).click();
  await demo.toast("feature/theme의 변경을 스테이지했어요. 메시지를 확인하고 커밋하세요");
  snap = await demo.snapshot();
  expect(snap.head.target).toBe(orbit);
  expect(snap.state).toBe("clean");
  expect(snap.changes.some((c) => c.staged)).toBe(true);
  await expect(page.locator(".composer textarea.message")).toHaveValue(
    /^feature\/theme\n\n\* Neon theme tokens\n\* Glow shader for edges\n/,
  );
  await page.keyboard.press("Control+Enter");
  await demo.toast("커밋했어요");
  snap = await demo.snapshot();
  head = snap.commits.find((c) => c.id === snap.head.target)!;
  expect(head.parents).toEqual([orbit]);
  expect(head.summary).toBe("feature/theme");
});

test("a squash merge stopped on conflicts keeps its message, and cancelling goes back", async ({ demo }) => {
  const { page } = demo;
  const before = await demo.snapshot();
  await demo.mutate((d) => {
    d.clean();
    d.conflictNext = true;
  });
  await page.click(".sidebar li >> text=feature/theme", { button: "right" });
  await page.click(".context-menu >> text=에 병합");
  const dialog = page.getByRole("dialog", { name: "병합" });
  await dialog.getByRole("radio", { name: "squash" }).click();
  await dialog.getByRole("button", { name: "스테이지" }).click();
  await expect(page.locator(".conflict-sheet")).toBeVisible();
  // The message waits in the composer, which commits the index (what the squash staged).
  await expect(page.locator(".composer textarea.message")).toHaveValue(/^feature\/theme\n/);
  const banner = page.locator(".banner", { hasText: "진행 중" });
  await expect(banner).toContainText("squash 병합 진행 중");
  await banner.getByRole("button", { name: "취소" }).click();
  await demo.toast("취소했어요");
  await expect(banner).toHaveCount(0);
  const snap = await demo.snapshot();
  expect(snap.state).toBe("clean");
  expect(snap.head.target).toBe(before.head.target);
  expect(snap.changes).toHaveLength(0);
});
