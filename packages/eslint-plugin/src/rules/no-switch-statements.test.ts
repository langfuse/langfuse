import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-switch-statements.js";

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

ruleTester.run("no-switch-statements", rule, {
  valid: [
    {
      code: `if (value === "a") return 1; return 2;`,
    },
    {
      code: `const valueMap = { a: 1, b: 2 } as const; const result = valueMap[value] ?? 0;`,
    },
    {
      code: `function render(value: string) { if (value === "a") return <div />; return null; }`,
    },
  ],
  invalid: [
    {
      code: `switch (value) { case "a": return 1; default: return 2; }`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `function render(value: string) { switch (value) { case "a": return <div />; default: return null; } }`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `if (enabled) { switch (value) { case "a": break; default: break; } }`,
      errors: [{ messageId: "unexpected" }],
    },
  ],
});
