import { join } from "node:path";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig, mergeConfig } from "vitest/config";
import sharedConfig from "./vitest.shared.mjs";

export default mergeConfig(
  sharedConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: "./vitest.shared.mts",
          plugins: [
            storybookTest({
              configDir: join(import.meta.dirname, ".storybook"),
              storybookScript: "pnpm run storybook -- --ci --no-open",
            }),
          ],
          test: {
            name: "storybook",
            setupFiles: ["./.storybook/vitest.setup.ts"],
            browser: {
              enabled: true,
              provider: playwright(),
              headless: true,
              instances: [{ browser: "chromium" }],
              commands: {
                async resetStorybookPointer({ page }) {
                  /** Page-level pointer movement avoids depending on the test iframe. */
                  await page.mouse.move(-1000, -1000);
                },
              },
            },
          },
        },
      ],
    },
  }),
);
