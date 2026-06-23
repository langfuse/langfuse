import { createRule } from "../util.js";

// Overlay wrappers (Dialog, Sheet, Popover, Select, Tooltip, …) must stack via
// the app layer system (components/ui/layer.tsx) — each portals into a layer
// `container` and the layers order by DOM order. A high/arbitrary z-index on an
// overlay wrapper is the old "escape to the top of <body>" habit this migration
// removed; it silently fights the layer order. z-index stays a LOCAL tool for
// ordering content WITHIN a layer (a dialog's sticky header `z-30`, a footer
// `z-10`, …), so only large values are banned.
//
// Banned: `z-50` and above, and arbitrary `z-[…]` whose value is >= the
// threshold (e.g. `z-[9999]`). Allowed: `z-0`..`z-40`, `z-auto`, and small
// arbitrary values. This rule is scoped (in eslint.config) to the overlay
// wrapper files; it is not a global z-index ban.
const Z_INDEX_THRESHOLD = 50;

// Tailwind important modifiers can wrap a utility token in either position,
// e.g. `!z-50` or `z-50!`.
function normalizeTailwindToken(token: string): string {
  return token.replace(/^!|!$/g, "");
}

// Strip a leading variant chain (`md:`, `dark:`, `data-[state=open]:`, …) to
// the final utility token. Bracketed variant segments can themselves contain
// colons, so split on top-level colons only.
function stripVariants(token: string): string {
  let depth = 0;
  let lastSeparator = -1;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === ":" && depth === 0) lastSeparator = i;
  }
  return lastSeparator === -1 ? token : token.slice(lastSeparator + 1);
}

// Return the numeric z-index of a normalized utility token if it is a banned
// overlay z-index, else null. Handles `z-50` and arbitrary `z-[9999]`.
function overlayZIndexValue(utility: string): number | null {
  const arbitrary = /^z-\[(-?\d+)\]$/.exec(utility);
  if (arbitrary) {
    const value = Number(arbitrary[1]);
    return value >= Z_INDEX_THRESHOLD ? value : null;
  }
  const scale = /^z-(\d+)$/.exec(utility);
  if (scale) {
    const value = Number(scale[1]);
    return value >= Z_INDEX_THRESHOLD ? value : null;
  }
  return null;
}

function* offendingZIndexUtilities(value: string): Generator<string> {
  for (const match of value.matchAll(/\S+/g)) {
    const utility = stripVariants(normalizeTailwindToken(match[0]));
    if (overlayZIndexValue(utility) !== null) yield utility;
  }
}

const rule = createRule({
  name: "no-overlay-zindex",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow high/arbitrary z-index utilities (z-50+, z-[9999], …) on overlay wrappers. Overlays must stack via the app layer system (route the portal through a layer container, see components/ui/layer.tsx), not by escalating z-index to escape to the top.",
    },
    schema: [],
    messages: {
      unexpected:
        "Avoid `{{utility}}` on overlay wrappers. Overlays stack via the layer system — route the portal into a layer `container` (see components/ui/layer.tsx) instead of escalating z-index. z-index is for ordering content WITHIN a layer only.",
    },
  },
  defaultOptions: [],
  create(context) {
    function check(node: { value?: unknown }, raw: unknown) {
      if (typeof raw !== "string") return;
      for (const utility of offendingZIndexUtilities(raw)) {
        context.report({
          node: node as never,
          messageId: "unexpected",
          data: { utility },
        });
        break;
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
