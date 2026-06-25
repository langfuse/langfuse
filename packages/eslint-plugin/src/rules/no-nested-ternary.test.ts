import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-nested-ternary.js";

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

ruleTester.run("no-nested-ternary", rule, {
  valid: [
    { code: `const value = condition ? first : second;` },
    { code: `const value = condition || (other ? first : second);` },
    { code: `const value = getValue(condition ? first : second);` },
  ],
  invalid: [
    {
      code: `const value = a ? b : c ? d : e;`,
      output: `const value = (() => {
  if (a) {
    return b;
  }
  if (c) {
    return d;
  }
  return e;
})();`,
      errors: [{ messageId: "noNestedTernary" }],
    },
    {
      code: `const value = a ? b ? c : d : e;`,
      output: null,
      errors: [{ messageId: "noNestedTernary" }],
    },
    {
      code: `const value = a ? b : c ? d ? e : f : g;`,
      output: null,
      errors: [
        { messageId: "noNestedTernary" },
        { messageId: "noNestedTernary" },
      ],
    },
    {
      code: `const value = a ? b : c ? d : e ? f : g;`,
      output: `const value = (() => {
  if (a) {
    return b;
  }
  if (c) {
    return d;
  }
  if (e) {
    return f;
  }
  return g;
})();`,
      errors: [
        { messageId: "noNestedTernary" },
        { messageId: "noNestedTernary" },
      ],
    },
    {
      code: `const element = <div>{a ? b : c ? d : e}</div>;`,
      output: `const element = <div>{(() => {
  if (a) {
    return b;
  }
  if (c) {
    return d;
  }
  return e;
})()}</div>;`,
      errors: [{ messageId: "noNestedTernary" }],
    },
    {
      code: `async function getValue() {
  const value = a ? await b() : c ? d : e;
}`,
      output: null,
      errors: [{ messageId: "noNestedTernary" }],
    },
    {
      code: `async function getValue() {
  const value = a ? [b, await c()] : d ? e : f;
}`,
      output: null,
      errors: [{ messageId: "noNestedTernary" }],
    },
    {
      code: `function* getValue() {
  const value = a ? yield b : c ? d : e;
}`,
      output: null,
      errors: [{ messageId: "noNestedTernary" }],
    },
  ],
});
