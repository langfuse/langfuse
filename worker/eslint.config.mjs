// @ts-check
import baseConfig from "@repo/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,

  // Worker-specific ignores
  {
    name: "langfuse/worker/ignores",
    ignores: ["**/*test*.*", "**/worker-thread.js"],
  },
];
