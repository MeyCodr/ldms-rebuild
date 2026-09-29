import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against a dev server on the seeded demo database.
// Locally they use the installed Microsoft Edge; CI can set PW_CHANNEL=chromium.
// PW_CHANNEL=chromium uses Playwright's bundled Chromium (CI); default is the installed Edge.
const channel = process.env.PW_CHANNEL === "chromium" ? undefined : (process.env.PW_CHANNEL ?? "msedge");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  // The dev server compiles pages on first visit, so allow more than the 5s default.
  expect: { timeout: 10_000 },
  fullyParallel: false,
  // One browser at a time locally: the dev server compiles on demand and slows down under parallel load.
  workers: process.env.CI ? 2 : 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3006",
    channel,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], viewport: { width: 1440, height: 900 } }, testIgnore: /responsive/ },
    { name: "phone", use: { ...devices["Pixel 7"], channel }, testMatch: /responsive/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3006/login", reuseExistingServer: true, timeout: 120_000 },
});
