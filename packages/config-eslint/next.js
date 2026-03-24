import tseslint from "typescript-eslint";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import turboConfig from "eslint-config-turbo/flat";
import "eslint-plugin-only-warn";

export default tseslint.config(
  // Global ignores - include config files
  {
    name: "langfuse/ignores",
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/.next/",
      "**/.next-check/",
      "**/coverage/",
      "eslint.config.mjs",
    ],
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
