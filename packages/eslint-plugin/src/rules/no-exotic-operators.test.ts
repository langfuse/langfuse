import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-exotic-operators.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
});

ruleTester.run("no-exotic-operators", rule, {
  valid: [
    `value = value ?? fallback;`,
    `const fallback = value ?? otherValue;`,
    `const enabled = first && second;`,
    `const result = base ** exponent;`,
    `const isMatch = first === second;`,
    `const disabled = !enabled;`,
    `const values = [first, second];`,
    `const typed = value as First | Second;`,
  ],
  invalid: [
    {
      code: `value ??= fallback;`,
      errors: [{ messageId: "unexpected", data: { operator: "??=" } }],
    },
    {
      code: `value ||= fallback;`,
      errors: [{ messageId: "unexpected", data: { operator: "||=" } }],
    },
    {
      code: `value &&= fallback;`,
      errors: [{ messageId: "unexpected", data: { operator: "&&=" } }],
    },
    {
      code: `const result = value & mask;`,
      errors: [{ messageId: "unexpected", data: { operator: "&" } }],
    },
    {
      code: `value >>>= 1;`,
      errors: [{ messageId: "unexpected", data: { operator: ">>>=" } }],
    },
    {
      code: `const result = ~value;`,
      errors: [{ messageId: "unexpected", data: { operator: "~" } }],
    },
    {
      code: `value **= exponent;`,
      errors: [{ messageId: "unexpected", data: { operator: "**=" } }],
    },
    {
      code: `const result = (first, second);`,
      errors: [{ messageId: "unexpected", data: { operator: "comma" } }],
    },
  ],
});
