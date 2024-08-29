import lib from "@repo/eslint-config/library.js";

export default [
  lib,
  {
    parser: "@typescript-eslint/parser",
    parserOptions: {
      project: true,
    },
    ignorePatterns: ["**/*test*.*"],
  },
];
