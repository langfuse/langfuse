import { mergeConfig } from "vitest/config";
import sharedConfig from "./vitest.shared.mjs";

export default mergeConfig(sharedConfig, {
  test: {
    projects: [
      {
        extends: "./vitest.shared.mts",
        test: {
          name: "client",
          include: [
            "src/**/*.clienttest.{ts,tsx}",
            ".storybook/docs/**/*.test.{ts,tsx}",
          ],
          exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
          environment: "jsdom",
          setupFiles: [
            "@testing-library/jest-dom/vitest",
            "./src/__tests__/flush-focus-scope-timers.ts",
          ],
        },
      },
    ],
  },
});
