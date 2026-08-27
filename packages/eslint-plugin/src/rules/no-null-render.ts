import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createComponentReturnExpressionVisitors } from "../react-components.js";
import { createRule } from "../util.js";

function isNullLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === null;
}

function isUndefinedIdentifier(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier && node.name === "undefined";
}

function unwrapTypeExpression(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    current = current.expression;
  }
  return current;
}

function visitNullishRender(
  node: TSESTree.Node,
  onNullish: (nullishNode: TSESTree.Node) => void,
): void {
  const unwrapped = unwrapTypeExpression(node);

  if (isNullLiteral(unwrapped) || isUndefinedIdentifier(unwrapped)) {
    onNullish(unwrapped);
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.ConditionalExpression) {
    visitNullishRender(unwrapped.consequent, onNullish);
    visitNullishRender(unwrapped.alternate, onNullish);
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.LogicalExpression) {
    visitNullishRender(unwrapped.left, onNullish);
    visitNullishRender(unwrapped.right, onNullish);
  }
}

const rule = createRule({
  name: "no-null-render",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow React components that return null or undefined.",
    },
    schema: [],
    messages: {
      unexpectedNullishRender:
        "Do not return null or undefined from a component. Handle the condition in the parent, or extract a hook/HOC so this component always renders.",
    },
  },
  defaultOptions: [],
  create(context) {
    return createComponentReturnExpressionVisitors({
      onReturnExpression(node) {
        visitNullishRender(node, (nullishNode) => {
          context.report({
            node: nullishNode,
            messageId: "unexpectedNullishRender",
          });
        });
      },
    });
  },
});

export default rule;
