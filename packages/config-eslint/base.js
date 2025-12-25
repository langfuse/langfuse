// @ts-check
import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import turboConfig from "eslint-config-turbo/flat";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import "eslint-plugin-only-warn";

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/build/",
      "**/coverage/",
      "**/.next/",
      "**/.*",
      "eslint.config.js",
    ],
  },

  // Base JS rules
  js.configs.recommended,

  // TypeScript support (recommended, not strict)
  ...tseslint.configs.recommended,

  // Turbo monorepo rules
  ...turboConfig,

  // Prettier (last)
  eslintPluginPrettierRecommended,

  // Global settings
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
        React: "readonly",
        JSX: "readonly",
      },
    },
    rules: {
      "no-redeclare": "off",
      "import/order": "off",
    },
  },

  // TypeScript-specific
  {
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    rules: {
      "no-undef": "off",
      "no-restricted-globals": [
        "error",
        {
          name: "redis",
          message: "Import redis explicitly from '@langfuse/shared/src/server'",
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
