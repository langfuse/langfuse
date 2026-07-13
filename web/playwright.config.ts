import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 180000, // test timeout 180s (3 minutes)
  expect: {
    timeout: 60000, // assertion timeout 60s (increased for CI)
  },
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",
    actionTimeout: 10000, // 10s click/fill timeout
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
