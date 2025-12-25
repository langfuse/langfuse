// @ts-check
import baseConfig from "@repo/eslint-config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...baseConfig,

  // Allow underscore-prefixed unused vars
  {
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];
