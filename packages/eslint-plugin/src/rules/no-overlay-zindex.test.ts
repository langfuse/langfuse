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
    // Important modifier sitting AFTER the variant prefix.
    {
      code: `<div className="md:!z-50" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="hover:!z-9999" />`,
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<div className="dark:!z-[9999]" />`,
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

// overlay-content mode: flag a high z-index ONLY when it sits on an overlay
// content JSX element (name ends in `Content`), so the rule can run app-wide
// without flagging local page-chrome z-index on plain elements.
ruleTester.run("no-overlay-zindex (overlay-content mode)", rule, {
  valid: [
    // Local page-chrome z-index on plain elements — never flagged app-wide.
    {
      code: `<header className="sticky top-0 z-50 w-full" />`,
      options: [{ mode: "overlay-content" }],
    },
    {
      code: `<div className="fixed inset-x-0 z-50 flex" />`,
      options: [{ mode: "overlay-content" }],
    },
    {
      code: `<div className="z-9999" />`,
      options: [{ mode: "overlay-content" }],
    },
    // A non-overlay component that happens to take z-index is left alone.
    {
      code: `<SidebarRail className="z-50" />`,
      options: [{ mode: "overlay-content" }],
    },
    // Low z-index on an overlay content element is still fine.
    {
      code: `<DropdownMenuContent className="z-40" />`,
      options: [{ mode: "overlay-content" }],
    },
    // A className string not attached to any JSX element (assigned to a var) is
    // not attributable to an overlay, so it's left alone in this mode.
    {
      code: `const className = "z-50";`,
      options: [{ mode: "overlay-content" }],
    },
    // A high z-index on a plain child element of an overlay content element is
    // attributed to the child (a <div>), not the overlay — so not flagged.
    {
      code: `<DropdownMenuContent><div className="z-50" /></DropdownMenuContent>`,
      options: [{ mode: "overlay-content" }],
    },
    // Namespaced JSX names carry no overlay-content semantics → not flagged.
    {
      code: `<svg:Content className="z-50" />`,
      options: [{ mode: "overlay-content" }],
    },
  ],
  invalid: [
    // High z-index on overlay content elements IS flagged, app-wide.
    {
      code: `<DropdownMenuContent className="z-60 min-w-56" />`,
      options: [{ mode: "overlay-content" }],
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<HoverCardContent className="z-50 w-[520px]" />`,
      options: [{ mode: "overlay-content" }],
      errors: [{ messageId: "unexpected" }],
    },
    {
      code: `<TooltipContent className="relative isolate z-9999" />`,
      options: [{ mode: "overlay-content" }],
      errors: [{ messageId: "unexpected" }],
    },
    // className via cn(...) on an overlay content element is still attributed.
    {
      code: `<PopoverContent className={cn("z-50", className)} />`,
      options: [{ mode: "overlay-content" }],
      errors: [{ messageId: "unexpected" }],
    },
    // Member-expression element name (Primitive.Content) uses the trailing name.
    {
      code: `<DialogPrimitive.Content className="z-50" />`,
      options: [{ mode: "overlay-content" }],
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
