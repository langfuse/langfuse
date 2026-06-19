import { globalIgnores } from "eslint/config";
import storybook from "eslint-plugin-storybook";
import eslintPluginTailwindcss from "eslint-plugin-tailwindcss";

import nextConfig from "@repo/eslint-config/next";

export default [
  globalIgnores(["**/storybook-static/"]),

  ...nextConfig,
  ...storybook.configs["flat/recommended"],
  {
    ...eslintPluginTailwindcss.configs.recommended,
    settings: {
      tailwindcss: {
        cssConfigPath: "src/styles/globals.css",
      },
    },
    rules: {
      "tailwindcss/classnames-order": "off",
      "tailwindcss/no-custom-classname": "warn",
      // TODO: Enable these rule later
      // "tailwindcss/no-arbitrary-value": "warn",
      // "tailwindcss/no-contradicting-classname": "warn",
    },
  },

  // Design-system component APIs must use explicit variants instead of styling escape hatches.
  {
    name: "langfuse/web/design-system-no-style-props",
    files: ["src/components/design-system/**/*.{ts,tsx}"],
    ignores: ["src/components/design-system/**/*.stories.tsx"],
    rules: {
      "@repo/no-style-props": "error",
    },
  },

  // Tests legitimately exercise backwards-compatible (deprecated) read paths
  // such as getTraceById/getObservationById, so allow them in test code.
  {
    name: "langfuse/web/tests-allow-deprecated",
    files: ["src/__tests__/**", "src/__e2e__/**", "**/*.servertest.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
    },
  },

  // Restrict react-icons imports
  {
    name: "langfuse/web/react-icons-restriction",
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: "^react-icons$",
              message:
                "Only react-icons/si and react-icons/tb are allowed. Please use lucide-react for other icons.",
            },
            {
              regex: "^react-icons/(?!si(?:/|$)|tb(?:/|$)).*",
              message:
                "Only react-icons/si and react-icons/tb are allowed. Please use lucide-react for other icons.",
            },
          ],
        },
      ],
    },
  },
];
