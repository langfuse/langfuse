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
            group: [
              "react-icons",
              "react-icons/!(si|tb)",
              "react-icons/!(si|tb)/*",
            ],
            message:
              "Only react-icons/si and react-icons/tb are allowed. Please use lucide-react for other icons.",
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
