// @ts-check
import baseConfig from "@repo/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,

  // Worker-specific ignores
  {
    ignores: ["**/*test*.*", "**/worker-thread.js"],
  },
];
