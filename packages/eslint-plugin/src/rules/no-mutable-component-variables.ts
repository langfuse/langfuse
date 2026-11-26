import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

/**
 * Name-based component heuristic. No type information and no scope analysis.
 *
 * A function is treated as a React component when its own name, or the
 * variable it is assigned to, is PascalCase. Function expressions and arrow
 * functions count, including when `memo` or `forwardRef` (or `React.memo` /
 * `React.forwardRef`, nested) wraps them. `as`, `satisfies`, and non-null
 * assertions around that wrapper are unwrapped.
 *
 * Anonymous functions, lowercase helpers, and custom hooks (`useX`) are not
 * components. A `let` or `var` is reported only when the nearest enclosing
 * function is one of those components, so handlers, callbacks, and IIFEs can
 * still use local mutation and assign the result to a `const`.
 */

const PASCAL_CASE = /^[A-Z][A-Za-z0-9]*$/;

type ComponentFunction =
  | TSESTree.ArrowFunctionExpression
  | TSESTree.FunctionDeclaration
  | TSESTree.FunctionExpression;

function isPascalCase(name: string | undefined): boolean {
  return name !== undefined && PASCAL_CASE.test(name);
}

function wrapperName(callee: TSESTree.Node): string | null {
  if (callee.type === AST_NODE_TYPES.Identifier) return callee.name;
  if (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier
  ) {
    return callee.property.name;
  }
  return null;
}

function isMemoOrForwardRef(name: string | null): boolean {
  return name === "memo" || name === "forwardRef";
}

function unwrapComponentFunction(
  node: TSESTree.Node | null | undefined,
): TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression | null {
  if (!node) return null;
  if (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  ) {
    return node;
  }
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    return unwrapComponentFunction(node.expression);
  }
  if (node.type !== AST_NODE_TYPES.CallExpression) return null;
  if (!isMemoOrForwardRef(wrapperName(node.callee))) return null;
  const [first] = node.arguments;
  if (!first || first.type === AST_NODE_TYPES.SpreadElement) return null;
  return unwrapComponentFunction(first);
}

function nearestFunction(node: TSESTree.Node): ComponentFunction | null {
  let current: TSESTree.Node | undefined = node.parent;
  while (current) {
    if (
      current.type === AST_NODE_TYPES.FunctionDeclaration ||
      current.type === AST_NODE_TYPES.FunctionExpression ||
      current.type === AST_NODE_TYPES.ArrowFunctionExpression
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

const rule = createRule({
  name: "no-mutable-component-variables",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow let and var declarations directly in React component bodies.",
    },
    schema: [],
    messages: {
      useConst:
        "Use const in component bodies; derive the value with an expression, a function, or useMemo instead of reassigning.",
    },
  },
  defaultOptions: [],
  create(context) {
    const components = new Set<ComponentFunction>();

    return {
      FunctionDeclaration(node) {
        if (isPascalCase(node.id?.name)) components.add(node);
      },
      VariableDeclarator(node) {
        if (
          node.id.type !== AST_NODE_TYPES.Identifier ||
          !isPascalCase(node.id.name)
        ) {
          return;
        }
        const component = unwrapComponentFunction(node.init);
        if (component) components.add(component);
      },
      VariableDeclaration(node) {
        if (node.kind === "const") return;
        const enclosing = nearestFunction(node);
        if (!enclosing || !components.has(enclosing)) return;
        context.report({ node, messageId: "useConst" });
      },
    };
  },
});

export default rule;
