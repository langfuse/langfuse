import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import turboConfig from "eslint-config-turbo/flat";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import "eslint-plugin-only-warn";

export default tseslint.config(
  // Global ignores
  {
    name: "langfuse/ignores",
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/build/",
      "**/coverage/",
      "**/.next/",
      "**/.*",
      "eslint.config.mjs",
    ],
  },

  // Base JS rules (same as eslint v8 library.js)
  js.configs.recommended,

  // Turbo monorepo rules
  ...turboConfig,

  // Prettier (last for rule precedence)
  eslintPluginPrettierRecommended,

  // Global settings
  {
    name: "langfuse/base/globals",
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

  // TypeScript-specific - parser only + custom rules
  // Note: Old library.js had no TS rules, only eslint:recommended
  // Adding parser + plugin to support custom rules, but not extending recommended
  {
    name: "langfuse/base/typescript",
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      "no-undef": "off", // TypeScript handles this
      "no-dupe-class-members": "off", // TypeScript handles this (and supports overloads)
      "no-unused-vars": "off", // Use @typescript-eslint/no-unused-vars instead
      "no-restricted-globals": [
        "error",
        {
          name: "redis",
          message: "Import redis explicitly from '@langfuse/shared/src/server'",
        },
      ],
      // Custom rule from eslint v8 shared/.eslintrc.js
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
);
