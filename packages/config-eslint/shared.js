import eslintConfigPrettier from "eslint-config-prettier";
import turboConfig from "eslint-config-turbo/flat";
import tseslint from "typescript-eslint";
import langfusePlugin from "@repo/eslint-plugin";
import "eslint-plugin-only-warn";

// Files allowed to create each Prisma model's rows; globs match trailing path segments.
const prismaWriters = {
  apiKey: ["packages/shared/src/server/auth/apiKeys.ts"],
  roleAssignment: [
    "packages/shared/src/features/rbac/roleAssignmentService.ts",
  ],
};

export default [
  {
    name: "langfuse/shared/ignores",
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/coverage/",
      "**/generated/",
      "eslint.config.mjs",
    ],
  },

  // Turbo monorepo rules
  ...turboConfig,

  // Disable ESLint rules that conflict with Prettier formatting.
  eslintConfigPrettier,

  {
    name: "langfuse/shared/rules",
    rules: {
      // Preserve the ESLint 9 recommended baseline during the v10 upgrade.
      "no-unassigned-vars": "off",
      "no-useless-assignment": "off",
      "preserve-caught-error": "off",
      "no-shadow-restricted-names": ["error", { reportGlobalThis: false }],
      "no-void": "warn",
      "no-else-return": "warn",
      "no-unneeded-ternary": "warn",
      "no-nested-ternary": "error",
      "@repo/no-exotic-operators": "warn",
      "@repo/no-restricted-prisma-writes": ["error", { models: prismaWriters }],
    },
  },

  {
    name: "langfuse/shared/typescript-rules",
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      "no-unused-vars": "off", // Use @typescript-eslint/no-unused-vars instead
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
      "@typescript-eslint/no-inferrable-types": "warn",
    },
  },

  // Prisma `contains`/`startsWith`/`endsWith` and raw `LIKE` treat `_`, `%` and `\` as wildcards.
  {
    name: "langfuse/shared/no-unescaped-prisma-like-pattern",
    files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"],
    ignores: ["**/*.test.ts", "**/*.servertest.ts", "**/__tests__/**"],
    rules: {
      "@repo/no-unescaped-prisma-like-pattern": "warn",
    },
  },

  {
    name: "langfuse/shared/repo-plugin",
    plugins: {
      "@repo": langfusePlugin,
    },
  },

  // Vitest in-source testing should only be used while developing, not in committed code.
  {
    name: "langfuse/no-in-source-vitest",
    rules: {
      "@repo/no-in-source-vitest": "warn",
    },
  },
];
