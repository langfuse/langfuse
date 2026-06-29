import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-in-source-vitest.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-in-source-vitest", rule, {
  valid: [
    {
      code: `export const value = 42;`,
      filename: "/repo/web/src/features/example/value.ts",
    },
    {
      code: `if (import.meta.env.DEV) console.log("dev");`,
      filename: "/repo/web/src/features/example/value.ts",
    },
  ],
  invalid: [
    {
      code: `if (import.meta.vitest) {}`,
      filename: "/repo/web/src/features/example/value.ts",
      errors: [{ messageId: "unexpected" }],
    },
  ],
});
