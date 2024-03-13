/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@repo/eslint-config/server.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
  ignorePatterns: ["node_modules", ".eslintrc.js"],
};
