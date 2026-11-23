import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

// Banner adds the external link icon itself to every action that opens a new
// tab: external URLs, and in-app links with `newTab`. An action that passes
// the icon by hand doubles it, or shows it on a link that stays in the tab.
const EXTERNAL_LINK_ICONS = new Set([
  "ExternalLink",
  "ExternalLinkIcon",
  "SquareArrowOutUpRight",
  "SquareArrowOutUpRightIcon",
]);

function isBannerActionsAttribute(node: TSESTree.JSXAttribute): boolean {
  if (
    node.name.type !== AST_NODE_TYPES.JSXIdentifier ||
    node.name.name !== "actions"
  ) {
    return false;
  }
  const elementName = node.parent.name;
  return (
    elementName.type === AST_NODE_TYPES.JSXIdentifier &&
    elementName.name === "Banner"
  );
}

function isInsideBannerActions(node: TSESTree.Node): boolean {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (current.type === AST_NODE_TYPES.JSXAttribute) {
      return isBannerActionsAttribute(current);
    }
    current = current.parent;
  }
  return false;
}

const rule = createRule({
  name: "no-banner-external-link-icon",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow passing the external link icon to a Banner action. Banner adds it itself to links that open a new tab.",
    },
    schema: [],
    messages: {
      unexpected:
        "Remove `icon: {{icon}}`. Banner adds the external link icon itself to links that open a new tab: use `href`, plus `newTab` for an in-app link.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      Property(node) {
        if (
          node.key.type !== AST_NODE_TYPES.Identifier ||
          node.key.name !== "icon" ||
          node.value.type !== AST_NODE_TYPES.Identifier ||
          !EXTERNAL_LINK_ICONS.has(node.value.name)
        ) {
          return;
        }
        if (isInsideBannerActions(node)) {
          context.report({
            node,
            messageId: "unexpected",
            data: { icon: node.value.name },
          });
        }
      },
    };
  },
});

export default rule;
