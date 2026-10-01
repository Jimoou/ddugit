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

  screenOf(id: string) {
    return this.page.evaluate((id) => (window as unknown as DemoWindow).__otgit.screenOf(id), id);
  }

  toast(text: string | RegExp) {
    return expect(this.page.locator(".toast").filter({ hasText: text })).toBeVisible();
  }

  async zoom(): Promise<number> {
    return parseInt((await this.page.locator(".hud .zoom").textContent()) ?? "0", 10);
  }
}
