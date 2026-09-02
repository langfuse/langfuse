import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createComponentReturnExpressionVisitors } from "../react-components.js";
import { createRule } from "../util.js";

type RenderKind = "passthrough" | "presentation" | "other";

type ResolveReturnExpression = (
  expression: TSESTree.Expression,
) => TSESTree.Expression;

function isNullLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === null;
}

function isUndefinedIdentifier(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Identifier && node.name === "undefined";
}

function isNullish(node: TSESTree.Node): boolean {
  return isNullLiteral(node) || isUndefinedIdentifier(node);
}

function isFalseLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === false;
}

function unwrapExpression(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion ||
    current.type === AST_NODE_TYPES.ChainExpression
  ) {
    current = current.expression;
  }
  return current;
}

function isChildrenExpression(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Identifier) {
    return node.name === "children";
  }
  if (node.type !== AST_NODE_TYPES.MemberExpression || node.computed) {
    return false;
  }
  return (
    node.object.type === AST_NODE_TYPES.Identifier &&
    node.object.name === "props" &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === "children"
  );
}

function isChildrenCall(node: TSESTree.CallExpression): boolean {
  return isChildrenExpression(unwrapExpression(node.callee));
}

function isCreatePortalCall(node: TSESTree.CallExpression): boolean {
  const callee = unwrapExpression(node.callee);
  if (
    callee.type === AST_NODE_TYPES.Identifier &&
    callee.name === "createPortal"
  ) {
    return true;
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    callee.property.name === "createPortal"
  );
}

function isFragmentElement(node: TSESTree.JSXElement): boolean {
  const name = node.openingElement.name;
  if (name.type === AST_NODE_TYPES.JSXIdentifier) {
    return name.name === "Fragment";
  }
  if (name.type !== AST_NODE_TYPES.JSXMemberExpression) {
    return false;
  }
  return (
    name.object.type === AST_NODE_TYPES.JSXIdentifier &&
    name.object.name === "React" &&
    name.property.name === "Fragment"
  );
}

function hasOnlyEmptyJsxChildren(children: TSESTree.JSXChild[]): boolean {
  return children.every((child) => {
    if (child.type === AST_NODE_TYPES.JSXText) {
      return child.value.trim() === "";
    }
    return (
      child.type === AST_NODE_TYPES.JSXExpressionContainer &&
      child.expression.type === AST_NODE_TYPES.JSXEmptyExpression
    );
  });
}

function isEmptyFragment(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.JSXFragment) {
    return hasOnlyEmptyJsxChildren(node.children);
  }
  return (
    node.type === AST_NODE_TYPES.JSXElement &&
    isFragmentElement(node) &&
    hasOnlyEmptyJsxChildren(node.children)
  );
}

function isRenderOutput(
  node: TSESTree.Expression,
  resolve: ResolveReturnExpression,
): boolean {
  const unwrapped = unwrapExpression(resolve(node));

  if (isNullish(unwrapped) || isChildrenExpression(unwrapped)) return true;
  if (
    unwrapped.type === AST_NODE_TYPES.JSXElement ||
    unwrapped.type === AST_NODE_TYPES.JSXFragment
  ) {
    return true;
  }
  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    return isCreatePortalCall(unwrapped) || isChildrenCall(unwrapped);
  }
  if (unwrapped.type === AST_NODE_TYPES.ConditionalExpression) {
    return (
      isRenderOutput(unwrapped.consequent, resolve) ||
      isRenderOutput(unwrapped.alternate, resolve)
    );
  }
  if (unwrapped.type === AST_NODE_TYPES.LogicalExpression) {
    return (
      isRenderOutput(unwrapped.left, resolve) ||
      isRenderOutput(unwrapped.right, resolve)
    );
  }
  if (unwrapped.type === AST_NODE_TYPES.ArrayExpression) {
    return unwrapped.elements.some(
      (element) =>
        element !== null &&
        element.type !== AST_NODE_TYPES.SpreadElement &&
        isRenderOutput(element, resolve),
    );
  }
  return false;
}

function collectJsxChildren(
  children: TSESTree.JSXChild[],
  resolve: ResolveReturnExpression,
  kinds: Set<RenderKind>,
): void {
  for (const child of children) {
    if (child.type === AST_NODE_TYPES.JSXText) {
      if (child.value.trim() !== "") kinds.add("other");
      continue;
    }
    if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
      if (child.expression.type !== AST_NODE_TYPES.JSXEmptyExpression) {
        collectRenderKinds(child.expression, resolve, kinds);
      }
      continue;
    }
    if (
      child.type === AST_NODE_TYPES.JSXElement ||
      child.type === AST_NODE_TYPES.JSXFragment
    ) {
      collectRenderKinds(child, resolve, kinds);
      continue;
    }
    kinds.add("other");
  }
}

function collectRenderKinds(
  node: TSESTree.Expression,
  resolve: ResolveReturnExpression,
  kinds: Set<RenderKind>,
): void {
  const unwrapped = unwrapExpression(resolve(node));

  if (isNullish(unwrapped)) return;
  if (isChildrenExpression(unwrapped)) {
    kinds.add("passthrough");
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.CallExpression) {
    if (isChildrenCall(unwrapped)) {
      kinds.add("passthrough");
      return;
    }
    if (isCreatePortalCall(unwrapped)) {
      const firstArg = unwrapped.arguments[0];
      if (!firstArg || firstArg.type === AST_NODE_TYPES.SpreadElement) {
        kinds.add("other");
        return;
      }
      collectRenderKinds(firstArg, resolve, kinds);
      return;
    }
    kinds.add("other");
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.ConditionalExpression) {
    collectRenderKinds(unwrapped.consequent, resolve, kinds);
    collectRenderKinds(unwrapped.alternate, resolve, kinds);
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.LogicalExpression) {
    if (
      unwrapped.operator !== "&&" ||
      isRenderOutput(unwrapped.left, resolve)
    ) {
      collectRenderKinds(unwrapped.left, resolve, kinds);
    }
    collectRenderKinds(unwrapped.right, resolve, kinds);
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.ArrayExpression) {
    for (const element of unwrapped.elements) {
      if (!element || element.type === AST_NODE_TYPES.SpreadElement) {
        kinds.add("other");
        continue;
      }
      collectRenderKinds(element, resolve, kinds);
    }
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.JSXFragment) {
    collectJsxChildren(unwrapped.children, resolve, kinds);
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.JSXElement) {
    if (isFragmentElement(unwrapped)) {
      collectJsxChildren(unwrapped.children, resolve, kinds);
      return;
    }
    kinds.add("presentation");
    return;
  }

  kinds.add("other");
}

function isHeadlessPassthrough(
  expressions: TSESTree.Expression[],
  resolve: ResolveReturnExpression,
): boolean {
  const kinds = new Set<RenderKind>();
  for (const expression of expressions) {
    collectRenderKinds(expression, resolve, kinds);
  }
  return (
    kinds.has("passthrough") &&
    !kinds.has("presentation") &&
    !kinds.has("other")
  );
}

function visitEmptyRender(
  node: TSESTree.Expression,
  onEmptyRender: (emptyNode: TSESTree.Node) => void,
  resolve: ResolveReturnExpression,
): void {
  const unwrapped = unwrapExpression(resolve(node));

  if (
    isNullish(unwrapped) ||
    isFalseLiteral(unwrapped) ||
    isEmptyFragment(unwrapped)
  ) {
    onEmptyRender(unwrapped);
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.ConditionalExpression) {
    visitEmptyRender(unwrapped.consequent, onEmptyRender, resolve);
    visitEmptyRender(unwrapped.alternate, onEmptyRender, resolve);
    return;
  }

  if (unwrapped.type === AST_NODE_TYPES.LogicalExpression) {
    visitEmptyRender(unwrapped.left, onEmptyRender, resolve);
    visitEmptyRender(unwrapped.right, onEmptyRender, resolve);
  }
}

const rule = createRule({
  name: "no-null-render",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow React components that render nothing, except headless children/portal passthroughs.",
    },
    schema: [],
    messages: {
      unexpectedNullishRender:
        "Do not render nothing from a component. Handle the condition in the parent, or extract a hook/HOC so this component always renders. Headless gates and portals that only pass through children may render nothing.",
    },
  },
  defaultOptions: [],
  create(context) {
    return createComponentReturnExpressionVisitors({
      onComponentReturns(expressions, resolve) {
        if (isHeadlessPassthrough(expressions, resolve)) return;
        for (const expression of expressions) {
          visitEmptyRender(
            expression,
            (emptyNode) => {
              context.report({
                node: emptyNode,
                messageId: "unexpectedNullishRender",
              });
            },
            resolve,
          );
        }
      },
    });
  },
});

export default rule;
