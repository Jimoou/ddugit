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
