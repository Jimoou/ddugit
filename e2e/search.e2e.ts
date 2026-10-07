// Searching the whole history from the graph's search bar (⌘/Ctrl+F), beyond the loaded commits.

import { expect, test } from "./fixtures";

test("searches all history by message, loading older history to fly to a match", async ({ demo }) => {
  const { page } = demo;
  // Load 1000 commits at a time, then bury the demo's own history under 1200 newer ones.
  await page.evaluate(() => localStorage.setItem("ddugit.settings", JSON.stringify({ historyPage: 1000 })));
  await page.reload();
  await expect(page.locator(".topbar")).toBeVisible();
  await demo.mutate((d) => d.grow(1200));
  const all = (await demo.snapshot()).commits;
  const id = (summary: string) => all.find((c) => c.summary === summary)!.id;
  const drawn = (commit: string) => page.evaluate((c) => window.__ddugit.screenOf(c), commit);
  await expect.poll(() => drawn(all[999].id)).not.toBeNull();
  expect(await drawn(id("Tune particle speed"))).toBeNull();

  const bar = page.locator(".search-bar");
  const input = bar.locator("input").first();
  const count = bar.locator(".count");
  const title = page.locator(".inspector h2");
  const results = bar.getByRole("list", { name: "검색 결과" }).getByRole("button");

  await page.keyboard.press("Control+f");
  await input.fill("particle");
  // Not in the loaded graph; Enter asks git about the whole history (by message).
  await expect(count).toHaveText("없음");
  await input.press("Enter");
  await expect(bar.getByRole("radio", { name: "메시지" })).toHaveAttribute("aria-checked", "true");
  await expect(results).toHaveCount(2);
  await expect(results.first()).toContainText("Tune particle speed");
  // The first match is selected once the older history it is in has loaded.
  await expect(count).toHaveText("1 / 2");
  await expect(title).toHaveText("Tune particle speed");
  await expect.poll(() => drawn(id("Tune particle speed"))).not.toBeNull();

  await input.press("Enter");
  await expect(count).toHaveText("2 / 2");
  await expect(title).toHaveText("Sparkle particles");
  await input.press("Shift+Enter");
  await expect(title).toHaveText("Tune particle speed");
  await results.nth(1).click();
  await expect(title).toHaveText("Sparkle particles");

  // A regex narrows it; a bad one says why.
  await bar.getByLabel("정규식").check();
  await input.fill("^sparkle");
  await input.press("Enter");
  await expect(count).toHaveText("1 / 1");
  await input.fill("(");
  await input.press("Enter");
  await demo.toast("invalid regular expression");
});

test("searches all history by file path, content and author", async ({ demo }) => {
  const { page } = demo;
  const bar = page.locator(".search-bar");
  const input = bar.locator("input").first();
  const count = bar.locator(".count");
  const title = page.locator(".inspector h2");
  const results = bar.getByRole("list", { name: "검색 결과" }).getByRole("button");

  await page.keyboard.press("Control+f");
  // Switching modes with a query in hand searches at once.
  await input.fill("Glow shader");
  await bar.getByRole("radio", { name: "내용" }).click();
  await expect(results).toHaveCount(1);
  await expect(title).toHaveText("Glow shader for edges");

  // Typing in a whole-history mode waits for Enter.
  await bar.getByRole("radio", { name: "파일" }).click();
  await input.fill("src/graph");
  await expect(count).toHaveText("");
  await input.press("Enter");
  await expect(count).toHaveText(/^1 \/ \d+$/);
  const first = (await results.first().locator(".summary").textContent())!;
  await expect(title).toHaveText(first);

  await bar.getByRole("radio", { name: "작성자" }).click();
  await input.fill("nobody-at-all");
  await input.press("Enter");
  await expect(count).toHaveText("없음");
  await expect(results).toHaveCount(0);

  // Back to the graph: typing searches the loaded commits again.
  await bar.getByRole("radio", { name: "그래프" }).click();
  await input.fill("PARTICLE");
  await expect(count).toHaveText("1 / 2");
});
