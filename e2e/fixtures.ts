import { test as base, expect, type Page } from "@playwright/test";
import type { RepoSnapshot } from "../src/types";

interface DemoWindow {
  __otgit: { screenOf(id: string): { x: number; y: number } | null };
  __otgitDemo: {
    conflictNext: boolean;
    snapshot(): RepoSnapshot;
    grow(n: number): void;
  };
}

/** Demo page with page errors collected; each test asserts there were none. */
export const test = base.extend<{ demo: Demo }>({
  demo: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto("/");
    await expect(page.locator(".topbar")).toContainText("otgit-demo");
    await use(new Demo(page));
    expect(errors).toEqual([]);
  },
});
export { expect };

export class Demo {
  constructor(readonly page: Page) {}

  snapshot(): Promise<RepoSnapshot> {
    return this.page.evaluate(() => (window as unknown as DemoWindow).__otgitDemo.snapshot());
  }

  /** Change demo state outside the UI, then refresh like returning to the window. */
  async mutate(fn: (demo: DemoWindow["__otgitDemo"]) => void) {
    await this.page.evaluate(`(${fn.toString()})(window.__otgitDemo)`);
    await this.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  }

  private rawScreenOf(id: string) {
    return this.page.evaluate((id) => (window as unknown as DemoWindow).__otgit.screenOf(id), id);
  }

  /** Screen position of a commit once the camera has stopped moving (it eases after loads). */
  async screenOf(id: string) {
    // Still for four samples in a row: one equal pair can land before a
    // camera move (e.g. right after a key press) has started.
    let last = await this.rawScreenOf(id);
    let still = 0;
    for (let i = 0; i < 60 && still < 4; i++) {
      await this.page.waitForTimeout(50);
      const now = await this.rawScreenOf(id);
      still = now && last && Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5 ? still + 1 : 0;
      last = now;
    }
    return last;
  }

  /**
   * Right-click a commit until its own menu opens. Even a still sample can
   * miss on a slow runner (a move can start right after it), so check the
   * menu's title and try again instead of trusting one click.
   */
  async commitMenu(id: string) {
    const summary = (await this.snapshot()).commits.find((c) => c.id === id)!.summary;
    const menu = this.page.locator(".context-menu");
    await expect(async () => {
      if (await menu.count()) await this.page.keyboard.press("Escape");
      await expect(menu).toHaveCount(0, { timeout: 1000 });
      const at = await this.screenOf(id);
      if (!at) throw new Error(`commit ${id.slice(0, 7)} is not drawn`);
      await this.page.mouse.click(at.x, at.y, { button: "right" });
      await expect(menu.locator(".menu-title")).toHaveText(summary, { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    return menu;
  }

  toast(text: string | RegExp) {
    return expect(this.page.locator(".toast").filter({ hasText: text })).toBeVisible();
  }

  async zoom(): Promise<number> {
    return parseInt((await this.page.locator(".hud .zoom").textContent()) ?? "0", 10);
  }
}
