import lib from "@repo/eslint-config/library.js";

console.log(lib);
export default [
  ...lib,
  {
    parser: "@typescript-eslint/parser",
    parserOptions: {
      project: true,
    },
  },
];
