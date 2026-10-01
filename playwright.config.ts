import { defineConfig, devices } from "@playwright/test";
import { BASE_PATH } from "./src/lib/base-path";

// End-to-end tests run against a dev server on the seeded demo database.
// Locally they use the installed Microsoft Edge; CI can set PW_CHANNEL=chromium.
// PW_CHANNEL=chromium uses Playwright's bundled Chromium (CI); default is the installed Edge.
// E2E_BASE_URL is the server's origin, e.g. http://localhost:3006.
const origin = process.env.E2E_BASE_URL ?? "http://localhost:3006";
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
    // The app lives under its base path, so tests go to relative paths such as
    // page.goto("trainings") (a leading "/" would leave the base path).
    baseURL: `${origin}${BASE_PATH}/`,
    channel,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Edge"], viewport: { width: 1440, height: 900 } }, testIgnore: /responsive/ },
    { name: "phone", use: { ...devices["Pixel 7"], channel }, testMatch: /responsive/ },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: `${origin}${BASE_PATH}/login`, reuseExistingServer: true, timeout: 120_000 },
});
