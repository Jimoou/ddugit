import { defineConfig, devices } from "@playwright/test";

// e2e runs against the browser demo (`npm run dev`), which implements the same
// commands as the Rust backend over a virtual repository (src/mock.ts).
export default defineConfig({
  testDir: "e2e",
  testMatch: "**/*.e2e.ts",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:1420",
    viewport: { width: 1400, height: 860 },
    trace: "retain-on-failure",
    // The default language follows the system; tests read Korean unless they switch.
    locale: "ko-KR",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1400, height: 860 },
        // Use a preinstalled Chromium when given (e.g. sandboxes without downloads).
        launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:1420",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
