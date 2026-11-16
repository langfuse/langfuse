import { type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";
import { extractTailwindUtilityTokens } from "../rule-helpers/tailwind.js";

// The app uses a three-weight type system: text-* size tokens carry the
// regular weight (--font-weight-regular), `font-medium` is the medium role
// (--font-weight-medium) and `font-bold` is the bold role (--font-weight-bold).
// Any other weight utility escapes the system and re-introduces the
// many-weights typography this migration removed.
//
// Banned: font-thin, font-extralight, font-light, font-semibold,
// font-extrabold, font-black, and arbitrary numeric weights like `font-[550]`
// — including variant-prefixed (`hover:font-semibold`, `dark:font-semibold`,
// `md:font-light`, `data-[state=open]:font-light`) and important-marked
// (`!font-semibold`, `font-semibold!`) forms.
//
// Allowed: `font-bold` (the bold role), `font-medium` (the medium role) and
// `font-normal` (explicit reset to the regular weight, e.g. to undo an
// inherited bold). Font-family utilities
// (`font-sans`, `font-mono`, `font-[Inter]`) are untouched.
const FORBIDDEN_FONT_WEIGHT_UTILITIES = new Set([
  "font-thin",
  "font-extralight",
  "font-light",
  "font-semibold",
  "font-extrabold",
  "font-black",
]);

// Arbitrary numeric weight, e.g. `font-[550]` or `font-[450.5]`. A non-numeric
// arbitrary value (`font-[Inter]`) is a font-family, not a weight.
const ARBITRARY_FONT_WEIGHT_PATTERN = /^font-\[\d+(?:\.\d+)?\]$/;

function isForbiddenFontWeightUtility(utility: string): boolean {
  return (
    FORBIDDEN_FONT_WEIGHT_UTILITIES.has(utility) ||
    ARBITRARY_FONT_WEIGHT_PATTERN.test(utility)
  );
}

function firstForbiddenFontWeight(value: string): string | null {
  for (const utility of extractTailwindUtilityTokens(value)) {
    if (isForbiddenFontWeightUtility(utility)) return utility;
  }
  return null;
}

const rule = createRule({
  name: "no-raw-font-weight",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow font-weight utilities outside the three-weight type system. `font-bold` is the bold role (reads --font-weight-bold) and `font-medium` the medium role (reads --font-weight-medium); text-* size tokens already carry the regular weight, so other weight utilities (font-semibold, font-light, font-[550], …) escape the design system.",
    },
    schema: [],
    messages: {
      unexpected:
        "Avoid `{{utility}}` — the type system has exactly three weights. Use `font-bold` for the bold role, `font-medium` for the medium role, or remove the utility entirely (text-* size tokens already carry the regular weight).",
    },
  },
  defaultOptions: [],
  create(context) {
    function check(node: TSESTree.Node, raw: unknown) {
      if (typeof raw !== "string") return;
      const utility = firstForbiddenFontWeight(raw);
      if (utility !== null) {
        context.report({ node, messageId: "unexpected", data: { utility } });
      }
    }
    return {
      Literal(node) {
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.raw);
      },
    };
  },
});

export default rule;
