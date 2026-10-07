import { test as base, expect, type Page } from "@playwright/test";
import type { DemoControls, DemoFlags } from "../src/mock";
import type { RepoSnapshot } from "../src/types";

declare global {
  interface Window {
    /** The visible graph's screen positions (dev builds). */
    __ddugit: {
      screenOf(id: string): { x: number; y: number } | null;
      /** Where a stash's diamond is drawn, by its index. */
      stashScreenOf(index: number): { x: number; y: number } | null;
      centerOn(id: string, zoom?: number): void;
    };
    /** The demo's switches (src/mock/controls.ts). */
    __ddugitDemo: DemoControls;
  }
}

/** Set demo flags before the next load (`page.reload()` / `goto`), e.g. `{ Pro: { pro: false, source: "free" } }`. */
export const demoFlags = (page: Page, flags: Partial<DemoFlags>) =>
  page.addInitScript((flags) => {
    for (const [name, value] of Object.entries(flags))
      (window as unknown as Record<string, unknown>)[`__ddugitDemo${name}`] = value;
  }, flags);

/** Demo page with page errors collected; each test asserts there were none. */
export const test = base.extend<{ demo: Demo }>({
  demo: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    // The tutorial panel would sit over the graph in every test; its own test opens it.
    await page.addInitScript(() => {
      if (localStorage.getItem("ddugit.voyage") === null)
        localStorage.setItem("ddugit.voyage", JSON.stringify({ done: [], dismissed: true }));
    });
    await page.goto("/");
    await expect(page.locator(".tab.on")).toContainText("ddugit-demo");
    await expect(page.locator(".topbar")).toBeVisible();
    await use(new Demo(page));
    expect(errors).toEqual([]);
  },
});
export { expect };

export class Demo {
  constructor(readonly page: Page) {}

  snapshot(): Promise<RepoSnapshot> {
    return this.page.evaluate(() => window.__ddugitDemo.snapshot());
  }

  /** Open one of the branch tools (backport, transfer, cleanup) from the ⋯ on the sidebar's branches. */
  async branchTool(name: "백포트…" | "폐쇄망 반출입…" | "브랜치 정리…") {
    await this.page.locator(".app:not([hidden]) .sidebar").getByRole("button", { name: "브랜치 작업 더 보기" }).click();
    await this.page.locator(".context-menu").getByRole("menuitem", { name }).click();
  }

  /** Go ahead in the "before pull / push" confirmation. */
  async confirmSync() {
    await this.page.locator(".dialog.sync-confirm button.primary").click();
  }

  /** Change demo state outside the UI without telling the app (no refresh). */
  async mutateQuietly(fn: (demo: DemoControls) => void) {
    await this.page.evaluate(`(${fn.toString()})(window.__ddugitDemo)`);
  }

  /** Change demo state outside the UI, then refresh like returning to the window. */
  async mutate(fn: (demo: DemoControls) => void) {
    await this.page.evaluate(`(${fn.toString()})(window.__ddugitDemo)`);
    await this.page.evaluate(() => window.dispatchEvent(new Event("focus")));
  }

  private rawScreenOf(id: string) {
    return this.page.evaluate((id) => window.__ddugit.screenOf(id), id);
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
   * menu's title and try again instead of trusting one click. A slow runner
   * can also take a while to show the menu: a late one with the right title
   * counts, and only a wrong one is closed.
   */
  async commitMenu(id: string) {
    const summary = (await this.snapshot()).commits.find((c) => c.id === id)!.summary;
    const menu = this.page.locator(".context-menu");
    const title = menu.locator(".menu-title");
    await expect(async () => {
      if (await menu.count()) {
        if ((await title.textContent()) === summary) return;
        await this.page.keyboard.press("Escape");
        await expect(menu).toHaveCount(0, { timeout: 3000 });
      }
      const at = await this.screenOf(id);
      if (!at) throw new Error(`commit ${id.slice(0, 7)} is not drawn`);
      await this.page.mouse.click(at.x, at.y, { button: "right" });
      await expect(title).toHaveText(summary, { timeout: 4000 });
    }).toPass({ timeout: 30_000 });
    return menu;
  }

  /** A toast with `text` is up (the newest one, when an earlier step left a similar one showing). */
  toast(text: string | RegExp) {
    return expect(this.page.locator(".toast").filter({ hasText: text }).last()).toBeVisible();
  }

  async zoom(): Promise<number> {
    return parseInt((await this.page.locator(".hud .zoom").textContent()) ?? "0", 10);
  }
}
