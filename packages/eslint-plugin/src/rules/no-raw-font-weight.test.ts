import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import { describe, expect, it, vi } from "vitest";
import rule from "./no-raw-font-weight.js";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: typescriptEslintParser,
    parserOptions: {
      ecmaFeatures: {
        jsx: true,
      },
    },
  },
});

ruleTester.run("no-raw-font-weight", rule, {
  valid: [
    // The two allowed weights.
    `<div className="font-bold" />`,
    `<div className="text-sm font-normal" />`,
    `<div className="hover:font-bold dark:font-normal" />`,
    // Font-family utilities are not weights.
    `<div className="font-sans" />`,
    `<div className="font-mono text-xs" />`,
    `<div className="font-[Inter]" />`,
    // Similar-looking non-weight tokens.
    `<div className="text-sm text-muted-foreground" />`,
    `const value = 42;`,
    // Weight name embedded in a longer token is not the utility itself.
    `<div className="peer/font-medium-picker" />`,
  ],
  invalid: [
    {
      code: `<div className="font-medium" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-medium" } }],
    },
    {
      code: `<div className="font-semibold" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-semibold" } }],
    },
    {
      code: `<div className="font-thin" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-thin" } }],
    },
    {
      code: `<div className="font-extralight" />`,
      errors: [
        { messageId: "unexpected", data: { utility: "font-extralight" } },
      ],
    },
    {
      code: `<div className="font-light" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-light" } }],
    },
    {
      code: `<div className="font-extrabold" />`,
      errors: [
        { messageId: "unexpected", data: { utility: "font-extrabold" } },
      ],
    },
    {
      code: `<div className="font-black" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-black" } }],
    },
    // Arbitrary numeric weights.
    {
      code: `<div className="font-[550]" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-[550]" } }],
    },
    // Variant-prefixed forms.
    {
      code: `<div className="hover:font-medium" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-medium" } }],
    },
    {
      code: `<div className="dark:md:font-semibold" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-semibold" } }],
    },
    {
      code: `<div className="data-[state=open]:font-light" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-light" } }],
    },
    // Important-marked forms.
    {
      code: `<div className="!font-medium" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-medium" } }],
    },
    {
      code: `<div className="md:font-semibold!" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-semibold" } }],
    },
    // Inside longer class strings, cn(...) calls, and template literals.
    {
      code: `<div className="text-sm font-medium text-muted-foreground" />`,
      errors: [{ messageId: "unexpected", data: { utility: "font-medium" } }],
    },
    {
      code: `const className = cn("flex font-semibold", className);`,
      errors: [{ messageId: "unexpected", data: { utility: "font-semibold" } }],
    },
    {
      code: "<div className={`flex ${x} font-light`} />",
      errors: [{ messageId: "unexpected", data: { utility: "font-light" } }],
    },
  ],
});

describe("no-raw-font-weight", () => {
  it("ignores template elements with non-string raw values", () => {
    const report = vi.fn();
    const listeners = rule.create({
      report,
    } as never);

    listeners.TemplateElement?.({
      value: {
        raw: null,
      },
    } as never);

    expect(report).not.toHaveBeenCalled();
  });
});
