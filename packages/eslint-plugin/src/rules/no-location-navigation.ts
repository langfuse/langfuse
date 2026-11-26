import {
  AST_NODE_TYPES,
  type TSESLint,
  type TSESTree,
} from "@typescript-eslint/utils";

import { createRule } from "../util.js";

const BROWSER_OBJECTS = new Set(["window", "document", "globalThis"]);

type RuleContext = TSESLint.RuleContext<"unexpected", []>;

function isUnboundIdentifier(
  node: TSESTree.Identifier,
  context: RuleContext,
): boolean {
  let scope: TSESLint.Scope.Scope | null = context.sourceCode.getScope(node);
  while (scope) {
    const variable = scope.set.get(node.name);
    if (variable) return variable.defs.length === 0;
    scope = scope.upper;
  }
  return true;
}

function isLocationObject(node: TSESTree.Node, context: RuleContext): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === "location" && isUnboundIdentifier(node, context);
  }
  if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return false;
  }
  if (
    node.property.type !== AST_NODE_TYPES.Identifier ||
    node.property.name !== "location"
  ) {
    return false;
  }
  return (
    node.object.type === AST_NODE_TYPES.Identifier &&
    BROWSER_OBJECTS.has(node.object.name) &&
    isUnboundIdentifier(node.object, context)
  );
}

function isLocationHref(node: TSESTree.Node, context: RuleContext): boolean {
  if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return false;
  }
  if (
    node.property.type !== AST_NODE_TYPES.Identifier ||
    node.property.name !== "href"
  ) {
    return false;
  }
  return isLocationObject(node.object, context);
}

const rule = createRule({
  name: "no-location-navigation",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow imperative browser navigation through the location object.",
    },
    messages: {
      unexpected: "Use the router for in-app navigation.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      AssignmentExpression(node) {
        if (
          isLocationObject(node.left, context) ||
          isLocationHref(node.left, context)
        ) {
          context.report({ node, messageId: "unexpected" });
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        if (
          callee.type !== AST_NODE_TYPES.MemberExpression ||
          callee.computed ||
          callee.property.type !== AST_NODE_TYPES.Identifier
        ) {
          return;
        }
        if (
          callee.property.name !== "assign" &&
          callee.property.name !== "replace"
        ) {
          return;
        }
        if (!isLocationObject(callee.object, context)) return;
        context.report({ node, messageId: "unexpected" });
      },
    };
  },
});

export default rule;
