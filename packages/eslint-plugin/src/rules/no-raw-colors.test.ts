import { RuleTester } from "@typescript-eslint/rule-tester";
import * as typescriptEslintParser from "@typescript-eslint/parser";
import { describe, expect, it, vi } from "vitest";
import rule from "./no-raw-colors.js";

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

ruleTester.run("no-raw-colors", rule, {
  valid: [
    // Role tokens are the point of the rule — always fine.
    `<div className="bg-primary text-primary-foreground" />`,
    `<div className="text-muted-foreground border-destructive" />`,
    `<div className="bg-background hover:bg-accent" />`,
    `<span className="text-obs-generation fill-score-positive" />`,
    // Arbitrary values are no-arbitrary-colors' scope, not this rule's.
    `<div className="bg-[#fff] text-[rgb(0,0,0)]" />`,
    `<div className="bg-[hsl(var(--muted))]" />`,
    // Non-color utilities that superficially resemble the pattern.
    `<div className="border-2 ring-2 shadow-sm outline-none" />`,
    `<div className="from-50% via-30%" />`,
    // Palette names WITHOUT a shade are role tokens here, not raw palette
    // colors (e.g. a semantic token that happens to be named like a hue).
    `<div className="text-destructive bg-warning" />`,
    // Not a color property prefix.
    `<div className="p-red-500" />`,
    `const value = 42;`,
    // Allowlisted baseline file — rule is silent regardless of content.
    {
      code: `<div className="bg-blue-500" />`,
      filename: "/repo/web/src/components/legacy.tsx",
      options: [{ allowFiles: ["web/src/components/legacy.tsx"] }],
    },
    // Directory entry (trailing slash) silences the whole subtree.
    {
      code: `<div className="text-red-500" />`,
      filename:
        "/repo/web/src/components/design-system/ThemeTokens/palette.tsx",
      options: [
        { allowFiles: ["web/src/components/design-system/ThemeTokens/"] },
      ],
    },
    // Same, with a repo-relative filename (no leading slash).
    {
      code: `<div className="text-red-500" />`,
      filename: "web/src/components/design-system/ThemeTokens/palette.tsx",
      options: [
        { allowFiles: ["web/src/components/design-system/ThemeTokens/"] },
      ],
    },
    // Exact-match file entry with a repo-relative filename.
    {
      code: `<div className="bg-blue-500" />`,
      filename: "web/src/components/legacy.tsx",
      options: [{ allowFiles: ["web/src/components/legacy.tsx"] }],
    },
  ],
  invalid: [
    {
      code: `<div className="bg-blue-500" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Variant prefixes are stripped before matching.
    {
      code: `<div className="hover:text-red-600" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="dark:bg-slate-800" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="data-[state=open]:border-gray-200" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Important markers in either position.
    {
      code: `<div className="!bg-red-500" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="md:!text-emerald-400" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Opacity modifier and directional side segment.
    {
      code: `<div className="bg-red-500/50" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="border-t-gray-200" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Gradient stops and the less common color properties.
    {
      code: `<div className="from-cyan-500" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<svg className="fill-amber-300 stroke-zinc-700" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Raw white/black text/background.
    {
      code: `<div className="text-white" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="bg-black/50" />`,
      errors: [{ messageId: "unexpected" }],
    },
    // Plain string assignment and cn(...) args are scanned like any literal.
    {
      code: `const className = "flex bg-purple-100 p-2";`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `const className = cn("text-pink-600", className);`,
      errors: [{ messageId: "unexpected" }],
    },
    // Template-literal chunks.
    {
      code: `<div className={\`flex bg-blue-500 \${extra}\`} />`,
      errors: [{ messageId: "unexpected" }],
    },
    // An allowFiles entry for a DIFFERENT file does not silence this one.
    {
      code: `<div className="bg-blue-500" />`,
      filename: "/repo/web/src/components/fresh.tsx",
      options: [{ allowFiles: ["web/src/components/legacy.tsx"] }],
      errors: [{ messageId: "unexpected" }],
    },
  ],
});

describe("no-raw-colors", () => {
  it("ignores template elements with non-string raw values", () => {
    const report = vi.fn();
    const listeners = rule.create({
      report,
      filename: "/repo/web/src/components/fresh.tsx",
      options: [{ allowFiles: [] }],
    } as never);

    listeners.TemplateElement?.({
      value: {
        raw: null,
      },
    } as never);

    expect(report).not.toHaveBeenCalled();
  });
});
