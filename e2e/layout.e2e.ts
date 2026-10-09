// The map's own controls and the window layout: resizable side panes, the minimap switch,
// the map lock, and commit summaries that stay readable zoomed out.

import { expect, test } from "./fixtures";

test("the sidebar and the right panel are resized by their edges, and keep their width", async ({ demo }) => {
  const { page } = demo;
  const sidebar = page.locator(".app:not([hidden]) .sidebar");
  const before = (await sidebar.boundingBox())!.width;
  const edge = (await page.getByRole("separator", { name: /사이드바 너비/ }).boundingBox())!;
  await page.mouse.move(edge.x + edge.width / 2, edge.y + 300);
  await page.mouse.down();
  await page.mouse.move(edge.x + 100, edge.y + 300, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(before + 80);

  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const panel = page.locator(".panel.composer");
  const narrow = (await panel.boundingBox())!.width;
  const handle = page.getByRole("separator", { name: /오른쪽 패널 너비/ });
  // Keys nudge it too: the panel is on the right, so ← widens it.
  await handle.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowLeft");
  await expect.poll(async () => (await panel.boundingBox())!.width).toBe(narrow + 32);

  await page.reload();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBeGreaterThan(before + 80);
  // A double-click puts the default back.
  await page.getByRole("separator", { name: /사이드바 너비/ }).dblclick();
  await expect.poll(async () => (await sidebar.boundingBox())!.width).toBe(before);
});

test("the minimap is turned off and on from the controls or with M", async ({ demo }) => {
  const { page } = demo;
  const minimap = page.locator(".app:not([hidden]) .minimap");
  await expect(minimap).toHaveCount(1);
  await page.getByRole("button", { name: "미니맵" }).click();
  await expect(minimap).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".app:not([hidden]) canvas").first()).toBeVisible();
  await expect(minimap).toHaveCount(0);
  await page.locator("body").press("m");
  await expect(minimap).toHaveCount(1);
});

test("a locked map only moves when a commit is dragged: no merge", async ({ demo }) => {
  const { page } = demo;
  await page.getByRole("button", { name: "맵 잠금" }).click();
  await expect(page.locator(".hint")).toContainText("맵 잠김");
  const before = await demo.snapshot();
  const tip = before.refs.find((r) => r.kind === "local" && r.name === "feature/theme")!.target;
  const a = (await demo.screenOf(tip))!;
  const z = (await demo.screenOf(before.head.target!))!;
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 60, a.y - 10, { steps: 8 });
  await page.mouse.move(z.x, z.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".dialog")).toHaveCount(0);
  await expect(page.locator(".drag-hint")).toHaveCount(0);
  // The map moved with the pointer instead.
  const moved = (await demo.screenOf(tip))!;
  expect(Math.round(moved.x - a.x)).toBe(Math.round(z.x - a.x));

  // L unlocks: the same drag merges again.
  await page.locator("body").press("l");
  await expect(page.locator(".hint")).not.toContainText("맵 잠김");
  const from = (await demo.screenOf(tip))!;
  const to = (await demo.screenOf(before.head.target!))!;
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y - 10, { steps: 8 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.locator(".dialog button.primary")).toBeVisible();
});

test("a long commit message pushes the inspector down instead of running over it", async ({ demo }) => {
  const { page } = demo;
  await page.setViewportSize({ width: 1300, height: 480 });
  await page.locator(".topbar button", { hasText: "커밋" }).click();
  const body = Array.from({ length: 8 }, (_, i) => `- line ${i + 1}: a body long enough to wrap in the panel`).join(
    "\n",
  );
  await page.locator(".composer textarea").fill(`Long message\n\n${body}`);
  await page.keyboard.press("Control+Enter");
  await demo.toast("커밋했어요");
  const head = (await demo.snapshot()).head.target!;
  await page.evaluate((id) => window.__ddugit.centerOn(id), head);
  const at = (await demo.screenOf(head))!;
  await page.mouse.click(at.x, at.y);
  const message = page.locator(".inspector .message");
  await expect(message.locator(".body")).toContainText("line 8");
  const m = (await message.boundingBox())!;
  const byline = (await page.locator(".inspector .byline").boundingBox())!;
  // The panel scrolls; the message keeps its whole height above the author line.
  expect(m.y + m.height).toBeGreaterThan(480);
  expect(byline.y).toBeGreaterThanOrEqual(m.y + m.height);
});

test("the list button turns the map into one row per commit and back", async ({ demo }) => {
  const { page } = demo;
  const list = page.getByRole("button", { name: "목록 보기" });
  const graph = page.locator(".app:not([hidden]) .graph");
  await expect(list).toHaveAttribute("aria-pressed", "false");
  await list.click();
  await expect(list).toHaveAttribute("aria-pressed", "true");
  await expect(graph).toHaveClass(/upright/);
  // Kept across a reload, like the rotation it sets.
  await page.reload();
  await expect(page.getByRole("button", { name: "목록 보기" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "목록 보기" }).click();
  await expect(graph).not.toHaveClass(/upright/);
  await expect(page.locator(".hud .turn .deg").first()).toHaveText("0°");
});
