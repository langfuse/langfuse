export default [
  {
    extends: ["@repo/eslint-config/next.js"],
    parser: "@typescript-eslint/parser",
    parserOptions: {
      project: true,
    },
  },
];
