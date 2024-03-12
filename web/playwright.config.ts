import { defineConfig } from "@playwright/test";

export default defineConfig({
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: process.env.CI ? "yarn run start" : "yarn run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    stdout: "ignore",
    stderr: "pipe",
  },
});
