/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ["@repo/eslint-config/next.js"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
  },
  rules: {
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["react-icons", "react-icons/*"],
            message:
              "react-icons import not allowed. Please use lucide-react instead.",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      files: [
        "src/components/nav/support-menu-dropdown.tsx",
        "src/pages/auth/sign-in.tsx",
      ],
      rules: {
        "no-restricted-imports": "off",
      },
    },
  ],
};
