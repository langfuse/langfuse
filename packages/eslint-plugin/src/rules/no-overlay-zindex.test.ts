import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import { describe, expect, it, vi } from "vitest";
import rule from "./no-overlay-zindex.js";

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

ruleTester.run("no-overlay-zindex", rule, {
  valid: [
    // Local, within-layer z-index for ordering content is fine.
    `<div className="sticky top-0 z-30" />`,
    `<div className="z-10" />`,
    `<div className="z-40" />`,
    `<div className="z-0" />`,
    `<div className="z-auto" />`,
    `<div className="z-[40]" />`,
    `<div className="fixed inset-0 bg-black/50" />`,
    `const value = 42;`,
    // not a z-index utility
    `<div className="gap-50" />`,
    `<div className="grid-cols-50" />`,
  ],
  invalid: [
    {
      code: `<div className="fixed inset-0 z-50" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="z-9999" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="z-[9999]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="md:z-50" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="!z-50" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="z-50!" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="data-[state=open]:animate-in z-9999 overflow-hidden" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const className = "bg-popover z-50 min-w-32";`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const className = cn("flex z-[9999]", className);`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className={\`fixed inset-0 z-50\`} />`,
      errors: [{ messageId: "unexpected" }],
    },
  ],
});

describe("no-overlay-zindex", () => {
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
