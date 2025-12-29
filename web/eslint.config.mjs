import nextConfig from "@repo/eslint-config/next";

export default [
  ...nextConfig,

  // Restrict react-icons imports
  {
    name: "langfuse/web/react-icons-restriction",
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
  },

  // Exceptions for specific files
  {
    name: "langfuse/web/react-icons-exceptions",
    files: [
      "src/components/nav/support-menu-dropdown.tsx",
      "src/pages/auth/sign-in.tsx",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
