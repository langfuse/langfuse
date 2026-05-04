import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import { describe, expect, it, vi } from "vitest";
import rule from "./no-tailwind-overflow-scroll.js";

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

ruleTester.run("no-tailwind-overflow-scroll", rule, {
  valid: [
    `<div className="button" />`,
    `<div className="overflow-auto" />`,
    `<div className="overflow-x-auto" />`,
    `<div className="overflow-y-auto" />`,
    `<div className="overflow-scrollbar" />`,
    `const value = 42;`,
  ],
  invalid: [
    {
      code: `<div className="overflow-scroll" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="overflow-y-scroll" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="overflow-x-scroll" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="flex h-full overflow-x-scroll" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const className = "flex h-full overflow-y-scroll";`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const className = cn("text-muted-foreground flex h-full overflow-x-scroll", className);`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="md:overflow-scroll" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className={\`flex overflow-x-scroll\`} />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="!overflow-scroll" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="overflow-scroll!" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="md:!overflow-scroll" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="md:overflow-scroll!" />`,
      errors: [{ messageId: "unexpected" }],
    },
  ],
});

describe("no-tailwind-overflow-scroll", () => {
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
