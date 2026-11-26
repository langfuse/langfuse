import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import rule from "./no-length-as-boolean.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  },
});

ruleTester.run("no-length-as-boolean", rule, {
  valid: [
    `if (items.length > 0) {}`,
    `if (items.length === 0) {}`,
    `const count = items.length;`,
    `return items.length;`,
    `const total = items.length + offset;`,
    `foo(items.length);`,
    `const count = items?.length ?? 0;`,
    `const count = items.length ?? 0;`,
    `const count = flag && items.length;`,
    `const count = flag || items.length;`,
    `for (let i = 0; i < items.length; i++) {}`,
    `for (items.length; i < 1; i++) {}`,
    `if ((items as string[])!.length > 0) {}`,
    `if (items.foo.length > 0) {}`,
    `if (foo().length > 0) {}`,
    `items["length"];`,
    `items[length];`,
    `const element = <span>{items.length}</span>;`,
    `const element = <span>{items?.length ?? 0}</span>;`,
    `const element = <span>{flag && items.length}</span>;`,
    `const element = <List count={items.length || 10} />;`,
    `const element = <List count={items.length && flag} />;`,
    `const element = <List count={items.length && flag && extra} />;`,
    `const element = <span>{items.length || <Empty />}</span>;`,
    `const count = items.length || fallback;`,
  ],
  invalid: [
    {
      code: `if (items.length) {}`,
      output: `if (items.length > 0) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `while (items.length) {}`,
      output: `while (items.length > 0) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `do {} while (items.length);`,
      output: `do {} while (items.length > 0);`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `for (; items.length;) {}`,
      output: `for (; items.length > 0;) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const value = items.length ? a : b;`,
      output: `const value = items.length > 0 ? a : b;`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const empty = !items.length;`,
      output: `const empty = (items.length === 0);`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const present = !!items.length;`,
      output: `const present = (items.length > 0);`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (items.length && flag) {}`,
      output: `if (items.length > 0 && flag) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (flag && items.length) {}`,
      output: `if (flag && items.length > 0) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (items.length || flag) {}`,
      output: `if (items.length > 0 || flag) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const element = <span>{items.length && <List />}</span>;`,
      output: `const element = <span>{items.length > 0 && <List />}</span>;`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const element = items.length && <List />;`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (items?.length) {}`,
      output: `if ((items != null && items.length > 0)) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const empty = !items?.length;`,
      output: `const empty = (items == null || items.length === 0);`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (a?.b.length) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (items?.length ?? fallback) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if ((items?.length && flag) ?? other) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const count = items.length && fallback;`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (items.length ?? fallback) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (a?.().length) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if ((a?.b).length) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if ((items as string[])!.length) {}`,
      output: `if ((items as string[])!.length > 0) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (items.length as number) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (items.length satisfies number) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (<number>items.length) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
      languageOptions: {
        parserOptions: {
          ecmaFeatures: { jsx: false },
        },
      },
    },
    {
      code: `if (flag || items.length) {}`,
      output: `if (flag || items.length > 0) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (a && b && items.length) {}`,
      output: `if (a && b && items.length > 0) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (foo().length) {}`,
      output: `if (foo().length > 0) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (!(flag && items.length)) {}`,
      output: `if (!(flag && items.length > 0)) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (flag || (other || items.length)) {}`,
      output: `if (flag || (other || items.length > 0)) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if ((flag && items.length) ?? other) {}`,
      output: `if ((flag && items.length > 0) ?? other) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (flag ?? items.length) {}`,
      output: `if (flag ?? items.length > 0) {}`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const same = true === !items.length;`,
      output: `const same = true === (items.length === 0);`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const same = true === !!items.length;`,
      output: `const same = true === (items.length > 0);`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (!items?.length) items.map(fn);`,
      output: `if ((items == null || items.length === 0)) items.map(fn);`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const present = !!items?.length;`,
      output: `const present = (items != null && items.length > 0);`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `if (a?.b?.length) {}`,
      output: null,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
    {
      code: `const element = <span>{(flag || items.length) && <List />}</span>;`,
      output: `const element = <span>{(flag || items.length > 0) && <List />}</span>;`,
      errors: [{ messageId: "lengthAsBoolean" }],
    },
  ],
});
