// The graph itself: folding, keyboard, rotation, the preview card and lit branches.

import { expect, test } from "./fixtures";

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

test("finds commits with Ctrl+F, walks the matches with Enter and Shift+Enter, and flies to each", async ({ demo }) => {
  const { page } = demo;
  const snap = await demo.snapshot();
  const id = (summary: string) => snap.commits.find((c) => c.summary === summary)!.id;
  // Newest first: the two commits that mention particles.
  const [newer, older] = [id("Tune particle speed"), id("Sparkle particles")];
  const bar = page.locator(".search-bar");
  const input = bar.getByPlaceholder("메시지 · 작성자 · SHA · 브랜치");
  const count = bar.locator(".count");
  const title = page.locator(".inspector h2");
  const centered = async (commit: string) => {
    const box = (await page.locator(".app:not([hidden]) .graph-area canvas").boundingBox())!;
    const at = (await demo.screenOf(commit))!;
    return Math.abs(at.x - (box.x + box.width / 2)) < 40 && Math.abs(at.y - (box.y + box.height / 2)) < 40;
  };

  await page.keyboard.press("Control+f");
  await expect(input).toBeFocused();
  await input.fill("PARTICLE");
  await expect(count).toHaveText("1 / 2");
  await expect(title).toHaveText("Tune particle speed");
  await expect.poll(() => centered(newer)).toBe(true);

  await input.press("Enter");
  await expect(count).toHaveText("2 / 2");
  await expect(title).toHaveText("Sparkle particles");
  await expect.poll(() => centered(older)).toBe(true);
  // Past either end it wraps around.
  await input.press("Enter");
  await expect(count).toHaveText("1 / 2");
  await input.press("Shift+Enter");
  await expect(count).toHaveText("2 / 2");
  await bar.getByTitle("이전 (Shift+Enter)").click();
  await expect(count).toHaveText("1 / 2");

  // A SHA prefix finds its commit; nothing matching says so and the arrows rest.
  await input.fill(older.slice(0, 6));
  await expect(count).toHaveText("1 / 1");
  await expect(title).toHaveText("Sparkle particles");
  await input.fill("no such words");
  await expect(count).toHaveText("없음");
  await expect(bar.getByTitle("다음 (Enter)")).toBeDisabled();

  // Esc closes the bar and keeps the selected commit.
  await input.press("Escape");
  await expect(bar).toHaveCount(0);
  await expect(title).toHaveText("Sparkle particles");
});
