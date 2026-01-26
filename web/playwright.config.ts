import { defineConfig } from "@playwright/test";

export default defineConfig({
  timeout: 45000, // test timeout (default 30s)
  expect: {
    timeout: 7500, // assertion timeout (default 5s)
  },
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",
    actionTimeout: 7500, // click/fill timeout
  },
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
