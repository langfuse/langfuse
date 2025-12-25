// @ts-check
import tseslint from "typescript-eslint";
import { FlatCompat } from "@eslint/eslintrc";
import { fileURLToPath } from "node:url";
import path from "node:path";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import turboConfig from "eslint-config-turbo/flat";
import "eslint-plugin-only-warn";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** @type {import("eslint").Linter.Config[]} */
export default tseslint.config(
  // Global ignores - include config files
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/.next/",
      "**/coverage/",
      "eslint.config.js",
    ],
  },

  // Next.js rules via FlatCompat (applies to all files)
  ...compat.extends("next/core-web-vitals"),

  // TypeScript strict type checking - ONLY for TS files, with proper parser
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [...tseslint.configs.strictTypeChecked],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: process.cwd(),
      },
    },
  },

  // Turbo rules
  ...turboConfig,

  // Prettier (last)
  eslintPluginPrettierRecommended,

  // Custom rules for TS files
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
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
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-confusing-void-expression": "off",
      "@typescript-eslint/consistent-type-imports": [
        "warn",
        {
          prefer: "type-imports",
          fixStyle: "inline-type-imports",
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
      "react/jsx-key": ["error", { warnOnDuplicates: true }],
    },
  },
);
