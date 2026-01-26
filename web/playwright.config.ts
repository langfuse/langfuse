import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 60000, // test timeout 60s (default 30s)
  expect: {
    timeout: 10000, // assertion timeout 10s (default 5s)
  },
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",
    actionTimeout: 10000, // 10s click/fill timeout
  },
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
