import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

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
// arbitrary values.
//
// Two modes (set per-file via eslint.config, see `mode` option):
//   - "wrapper": ban a high z-index ANYWHERE in the file. Used on the `ui/*`
//     overlay primitive wrappers, where any high z-index is an escape.
//   - "overlay-content": ban a high z-index only when it sits on an overlay
//     *content* JSX element (e.g. `<DropdownMenuContent className="z-60">`,
//     `<HoverCardContent className="z-50">`, `<TooltipContent>`). These render
//     through a layer and must never carry a magic z-index — but plain page
//     chrome (`<header className="sticky z-50">`, fixed banners/toolbars) lives
//     inside the app's isolated `#__next` stacking context, can't escape it, so
//     its local z-index is fine and left untouched. This mode is enabled
//     app-wide so a consumer can't re-introduce an escape on an overlay it
//     imports (the very `nav-user.tsx` `z-60` regression this PR removed).
const Z_INDEX_THRESHOLD = 50;

type Mode = "wrapper" | "overlay-content";

// Overlay content components route through a layer (their `*.Portal` injects a
// layer `container`), so a high z-index on them is an escape. The names follow
// the Radix-wrapper convention used in `components/ui/*`: an uppercase
// component whose name ends in `Content` (DialogContent, SheetContent,
// PopoverContent, DropdownMenuContent, SelectContent, HoverCardContent,
// TooltipContent, AlertDialogContent, DropdownMenuSubContent, …). A bespoke
// `<div>`/`<header>` page-chrome element never matches, so it isn't flagged.
function isOverlayContentElementName(name: string): boolean {
  // `DropdownMenuContent`, `HoverCardContent`, `DropdownMenuSubContent`, … and
  // the bare Radix member form `Primitive.Content` (resolved to `Content`).
  return name === "Content" || /^[A-Z][A-Za-z]*Content$/.test(name);
}

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
    // Strip the variant chain first, THEN the important modifier. The `!` can
    // sit after the variant prefix (`md:!z-50`, `hover:!z-9999`,
    // `dark:!z-[9999]`); stripping variants first leaves `!z-50`, which
    // normalizeTailwindToken then reduces to `z-50` so the matcher sees it.
    const utility = normalizeTailwindToken(stripVariants(match[0]));
    if (overlayZIndexValue(utility) !== null) yield utility;
  }
}

// The tag name of the JSX opening element a className/style string belongs to,
// or null if the string isn't attached to one. Walks up from a
// Literal/TemplateElement through `cn(...)` args and the JSXExpressionContainer
// to the owning JSXOpeningElement (e.g. "DropdownMenuContent"). Stops at the
// first JSXElement boundary so a string in a *child* element isn't attributed
// to its parent's opening tag.
function enclosingJsxOpeningElementName(node: TSESTree.Node): string | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current && current.type !== AST_NODE_TYPES.JSXElement) {
    if (current.type === AST_NODE_TYPES.JSXOpeningElement) {
      const elementName = current.name;
      // Plain `<DropdownMenuContent>` or member `<Primitive.Content>` — the
      // trailing identifier is the meaningful name. Namespaced names (rare in
      // this codebase) have no overlay-content semantics, so null is fine.
      if (elementName.type === AST_NODE_TYPES.JSXIdentifier) {
        return elementName.name;
      }
      if (elementName.type === AST_NODE_TYPES.JSXMemberExpression) {
        return elementName.property.name;
      }
      return null;
    }
    current = current.parent;
  }
  return null;
}

const rule = createRule<[{ mode: Mode }], "unexpected">({
  name: "no-overlay-zindex",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow high/arbitrary z-index utilities (z-50+, z-[9999], …) on overlay wrappers and overlay content elements. Overlays must stack via the app layer system (route the portal through a layer container, see components/ui/layer.tsx), not by escalating z-index to escape to the top.",
    },
    schema: [
      {
        type: "object",
        properties: {
          mode: { type: "string", enum: ["wrapper", "overlay-content"] },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unexpected:
        "Avoid `{{utility}}` on overlay wrappers/content. Overlays stack via the layer system — route the portal into a layer `container` (see components/ui/layer.tsx) instead of escalating z-index. z-index is for ordering content WITHIN a layer only.",
    },
  },
  defaultOptions: [{ mode: "wrapper" }],
  create(context, [{ mode }]) {
    function check(node: TSESTree.Node, raw: unknown) {
      if (typeof raw !== "string") return;

      // In overlay-content mode, only flag z-index that sits on an overlay
      // *content* JSX element; leave local page-chrome z-index alone.
      if (mode === "overlay-content") {
        const elementName = enclosingJsxOpeningElementName(node);
        if (!elementName || !isOverlayContentElementName(elementName)) return;
      }

      for (const utility of offendingZIndexUtilities(raw)) {
        context.report({
          node,
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
