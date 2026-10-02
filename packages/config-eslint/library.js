import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import sharedConfig from "./shared.js";

export default tseslint.config(
  // Global ignores
  {
    name: "langfuse/ignores",
    ignores: ["**/build/", "**/.next/", "**/.*"],
  },

  // Library JS rules (same as eslint v8 library.js)
  js.configs.recommended,

  ...sharedConfig,

  // Global settings
  {
    name: "langfuse/library/globals",
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
    name: "langfuse/library/typescript",
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
      },
    },
    rules: {
      "no-undef": "off", // TypeScript handles this
      "no-dupe-class-members": "off", // TypeScript handles this (and supports overloads)
      "no-restricted-globals": [
        "error",
        {
          name: "redis",
          message: "Import redis explicitly from '@langfuse/shared/src/server'",
        },
      ],
      "@typescript-eslint/no-deprecated": "warn",
    },
  },
);
