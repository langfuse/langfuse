/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@repo/eslint-config/index.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
  env: {
    jest: true,
  },
};
