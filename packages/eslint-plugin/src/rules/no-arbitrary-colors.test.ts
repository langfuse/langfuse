import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import { describe, expect, it, vi } from "vitest";
import rule from "./no-arbitrary-colors.js";

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

ruleTester.run("no-arbitrary-colors", rule, {
  valid: [
    // Palette utilities are the point of the rule.
    `<div className="bg-destructive text-muted-foreground border-warning" />`,
    // Token-backed arbitrary values are the sanctioned escape hatch.
    `<div className="bg-[var(--surface)]" />`,
    `<div className="caret-[hsl(var(--foreground))]" />`,
    `<div className="shadow-[0_0_16px_2px_hsl(var(--primary-accent)/0.65)]" />`,
    `<div className="bg-[linear-gradient(90deg,var(--color-1),var(--color-5))]" />`,
    `<div className="text-[rgb(var(--accent-rgb))]" />`,
    // Lengths/geometry in arbitrary values are not colors.
    `<div className="border-[3px] text-[10px] ring-[3px]" />`,
    `<div className="border-[0.5px] text-[0.775rem]" />`,
    `<div className="shadow-[0_8px_16px_var(--shadow-color)]" />`,
    // Contextual keywords are not raw palette colors.
    `<div className="bg-[transparent] caret-[currentColor] border-[inherit]" />`,
    // Non-color arbitrary properties on matched prefixes.
    `<div className="text-[length:var(--size)] bg-[image:var(--img)]" />`,
    // color-mix over tokens (no raw color function literal).
    `<div className="bg-[color-mix(in_srgb,var(--a),var(--b))]" />`,
    // Prefixes outside the color set are ignored even with hex-ish content.
    `<div className="content-['#1']" />`,
    `const value = 42;`,
  ],
  invalid: [
    // Bare raw colors.
    {
      code: `<div className="bg-[#ff0000]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="text-[#333]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="border-[rgb(0,0,0)]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="bg-[rgba(255,255,255,0.5)]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="text-[hsl(210,40%,96%)]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="from-[oklch(66.2%_0.225_25.9)]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Named CSS colors as the whole value.
    {
      code: `<div className="bg-[red]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="caret-[rebeccapurple]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Raw colors embedded in shadows and gradients.
    {
      code: `<div className="shadow-[-12px_0_32px_-16px_rgb(0_0_0_/_0.30)]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="bg-[linear-gradient(#fff,#fff),linear-gradient(90deg,var(--color-1),var(--color-2))]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Directional/compound prefixes.
    {
      code: `<div className="border-t-[#eee]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="ring-offset-[#000]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Variant-prefixed, important-marked, and opacity-suffixed forms.
    {
      code: `<div className="dark:bg-[#0a0a0a]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="hover:!text-[#123456]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="data-[state=open]:bg-[#fff]" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="bg-[#fff]/50" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Inside longer class strings, cn(...) calls, and template literals.
    {
      code: `<div className="flex items-center bg-[#fafafa] p-2" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const className = cn("text-[rgb(1,2,3)]", className);`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: "<div className={`flex ${x} bg-[#000]`} />",
      errors: [{ messageId: "unexpected" }],
    },
  ],
});

describe("no-arbitrary-colors", () => {
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
