import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import sharedConfig from "./shared.js";

export default [
  // Global ignores - include config files
  {
    name: "langfuse/ignores",
    ignores: ["**/.next/", "**/.next-check/"],
  },

  // Next 16 ships native flat configs, so loading it through FlatCompat breaks.
  ...nextCoreWebVitals,

  // Keep the pre-React-Compiler hooks baseline used by this repo.
  {
    name: "langfuse/next/react-hooks-overrides",
    rules: {
      "react-hooks/component-hook-factories": "off",
      "react-hooks/config": "off",
      "react-hooks/error-boundaries": "off",
      "react-hooks/gating": "off",
      "react-hooks/globals": "off",
      "react-hooks/immutability": "off",
      "react-hooks/incompatible-library": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/purity": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/set-state-in-render": "off",
      "react-hooks/static-components": "off",
      "react-hooks/unsupported-syntax": "off",
      "react-hooks/use-memo": "off",
    },
  },

  ...sharedConfig,

  // Disable noisy turbo env var rule - project has many env vars not in turbo.json
  {
    name: "langfuse/next/turbo-overrides",
    rules: {
      "turbo/no-undeclared-env-vars": "off",
    },
  },

  // Layer repo-specific TS rules on top of Next's built-in flat TS config.
  // Next already provides the parser and @typescript-eslint plugin here.
  {
    name: "langfuse/next/typescript",
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
      globals: {
        React: "readonly",
        JSX: "readonly",
      },
    },
    settings: {
      "import/resolver": {
        typescript: {
          project: "./tsconfig.json",
        },
      },
    },
    rules: {
      "@repo/no-tailwind-overflow-scroll": "warn",
      // Custom rules from old config
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
        },
      ],
      "@typescript-eslint/no-deprecated": "warn",
      "react/jsx-key": ["error", { warnOnDuplicates: true }],
      "react/no-unused-prop-types": "warn",
    },
  },
];
