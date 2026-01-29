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

export default tseslint.config(
  // Global ignores - include config files
  {
    name: "langfuse/ignores",
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/.next/",
      "**/coverage/",
      "eslint.config.mjs",
    ],
  },

  // Next.js rules via FlatCompat (applies to all files)
  ...compat.extends("next/core-web-vitals"),

  // Turbo rules
  ...turboConfig,

  // Disable noisy turbo env var rule - project has many env vars not in turbo.json
  {
    name: "langfuse/next/turbo-overrides",
    rules: {
      "turbo/no-undeclared-env-vars": "off",
    },
  },

  // Prettier (last)
  eslintPluginPrettierRecommended,

  // TypeScript config for TS files
  // Note: The old config had a bug (duplicate extends) that prevented TS rules from applying
  // Only adding parser + plugin + custom rules to match old behavior
  {
    name: "langfuse/next/typescript",
    files: ["**/*.ts", "**/*.tsx"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    languageOptions: {
      parser: tseslint.parser,
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
      "no-unused-vars": "off", // Use @typescript-eslint/no-unused-vars instead
      // Custom rules from old config
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
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "react/jsx-key": ["error", { warnOnDuplicates: true }],
    },
  },
);
