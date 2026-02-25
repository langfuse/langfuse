import { defineConfig } from "@playwright/test";

const webPort = process.env.WEB_PORT ?? "3000";
const webBaseUrl = (process.env.NEXTAUTH_URL ?? `http://127.0.0.1:${webPort}`)
  .replace(/\/$/, "")
  .replace(/\/api\/auth$/, "");

export default defineConfig({
  timeout: 180000, // test timeout 180s (3 minutes)
  expect: {
    timeout: 60000, // assertion timeout 60s (increased for CI)
  },
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: webBaseUrl,
    actionTimeout: 10000, // 10s click/fill timeout
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: webBaseUrl,
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
