import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

type BooleanUse = "truthy" | "negated" | "double-negated";

const rule = createRule({
  name: "no-length-as-boolean",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow using a .length member expression as a truthiness test.",
    },
    fixable: "code",
    messages: {
      lengthAsBoolean:
        "Compare `.length` explicitly (for example `length > 0` or `length === 0`) instead of testing it for truthiness. A length of 0 is falsy, so an expression such as `length && <element>` renders 0.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    return {
      MemberExpression(node) {
        if (!isLengthMember(node)) return;

        const use = booleanUse(node);
        if (!use) return;

        context.report({
          node,
          messageId: "lengthAsBoolean",
          fix(fixer) {
            const expression = unwrapTransparent(node);
            if (
              expression.type === AST_NODE_TYPES.TSAsExpression ||
              expression.type === AST_NODE_TYPES.TSSatisfiesExpression ||
              expression.type === AST_NODE_TYPES.TSTypeAssertion ||
              expression.type === AST_NODE_TYPES.TSNonNullExpression
            ) {
              return null;
            }
            if (
              accessCanBeNullish(node) &&
              nullishCoalesceOwnsValue(expression)
            ) {
              return null;
            }

            const lengthText = sourceCode.getText(node);
            const compared = accessCanBeNullish(node)
              ? `(${lengthText} ?? 0)`
              : lengthText;

            if (use === "negated" || use === "double-negated") {
              const inner = parentOf(expression);
              const outer = inner.parent;
              const target =
                use === "double-negated" &&
                outer?.type === AST_NODE_TYPES.UnaryExpression
                  ? outer
                  : inner;
              const comparison =
                use === "negated" ? `${compared} === 0` : `${compared} > 0`;
              return fixer.replaceText(target, comparison);
            }

            if (!truthyFixPreservesValue(expression)) return null;
            return fixer.replaceText(node, `${compared} > 0`);
          },
        });
      },
    };
  },
});

function isLengthMember(
  node: TSESTree.MemberExpression,
): node is TSESTree.MemberExpression & {
  property: TSESTree.Identifier;
} {
  return (
    !node.computed &&
    node.property.type === AST_NODE_TYPES.Identifier &&
    node.property.name === "length"
  );
}

function parentOf(node: TSESTree.Node): TSESTree.Node {
  return node.parent as TSESTree.Node;
}

function booleanUse(member: TSESTree.MemberExpression): BooleanUse | null {
  const expression = unwrapTransparent(member);
  const parent = parentOf(expression);

  if (
    parent.type === AST_NODE_TYPES.UnaryExpression &&
    parent.operator === "!" &&
    parent.argument === expression
  ) {
    const grand = parent.parent;
    if (
      grand?.type === AST_NODE_TYPES.UnaryExpression &&
      grand.operator === "!" &&
      grand.argument === parent
    ) {
      return "double-negated";
    }
    return "negated";
  }

  if (isDirectTest(parent, expression)) return "truthy";

  if (!isAndOr(parent) && !isNullish(parent)) return null;

  if (isAndOr(parent) && parent.left === expression) return "truthy";

  return resultUsedAsBoolean(parent) ? "truthy" : null;
}

function isAndOr(
  node: TSESTree.Node,
): node is TSESTree.LogicalExpression & { operator: "&&" | "||" } {
  return (
    node.type === AST_NODE_TYPES.LogicalExpression &&
    (node.operator === "&&" || node.operator === "||")
  );
}

function isNullish(
  node: TSESTree.Node,
): node is TSESTree.LogicalExpression & { operator: "??" } {
  return (
    node.type === AST_NODE_TYPES.LogicalExpression && node.operator === "??"
  );
}

function isDirectTest(
  parent: TSESTree.Node,
  expression: TSESTree.Node,
): boolean {
  switch (parent.type) {
    case AST_NODE_TYPES.IfStatement:
    case AST_NODE_TYPES.WhileStatement:
    case AST_NODE_TYPES.DoWhileStatement:
    case AST_NODE_TYPES.ForStatement:
    case AST_NODE_TYPES.ConditionalExpression:
      return parent.test === expression;
    default:
      return false;
  }
}

/**
 * True when the expression's result is consumed only for truthiness, including
 * JSX children (`{items.length && <List />}`), where a falsy 0 would render.
 */
function resultUsedAsBoolean(node: TSESTree.Node): boolean {
  const expression = unwrapTransparent(node);
  const parent = parentOf(expression);
  if (isDirectTest(parent, expression)) return true;
  if (
    parent.type === AST_NODE_TYPES.UnaryExpression &&
    parent.operator === "!" &&
    parent.argument === expression
  ) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.JSXExpressionContainer &&
    parent.expression === expression
  ) {
    // `{count ?? 0}` renders a number. Only `&&` / `||` test truthiness here,
    // which is what makes `{items.length && <List />}` render 0.
    return isAndOr(expression);
  }
  if (
    (isAndOr(parent) || isNullish(parent)) &&
    (parent.left === expression || parent.right === expression)
  ) {
    return resultUsedAsBoolean(parent);
  }
  return false;
}

/**
 * Replacing `length` with `length > 0` keeps the produced value only when that
 * value is not returned as the original number (for example `length || fallback`
 * yields the count when it is non-zero).
 */
/** `a?.length ?? fallback` uses the missing length as nullish, not as a count. */
function nullishCoalesceOwnsValue(expression: TSESTree.Node): boolean {
  let current = expression;
  let parent = parentOf(current);
  while (isAndOr(parent) || isNullish(parent)) {
    if (isNullish(parent)) return true;
    current = parent;
    parent = parentOf(current);
  }
  return false;
}

function truthyFixPreservesValue(expression: TSESTree.Node): boolean {
  const parent = parentOf(expression);
  if (isDirectTest(parent, expression)) return true;
  if (
    parent.type === AST_NODE_TYPES.JSXExpressionContainer &&
    parent.expression === expression
  ) {
    return true;
  }
  if (
    parent.type === AST_NODE_TYPES.UnaryExpression &&
    parent.operator === "!" &&
    parent.argument === expression
  ) {
    return true;
  }
  if (!isAndOr(parent) && !isNullish(parent)) return false;
  return truthyFixPreservesValue(parent);
}

function unwrapTransparent(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  let parent = parentOf(current);
  while (parent !== current && isTransparentWrapper(parent, current)) {
    current = parent;
    parent = parentOf(current);
  }
  return current;
}

function isTransparentWrapper(
  parent: TSESTree.Node,
  child: TSESTree.Node,
): boolean {
  return (
    (parent.type === AST_NODE_TYPES.ChainExpression ||
      parent.type === AST_NODE_TYPES.TSAsExpression ||
      parent.type === AST_NODE_TYPES.TSNonNullExpression ||
      parent.type === AST_NODE_TYPES.TSSatisfiesExpression ||
      parent.type === AST_NODE_TYPES.TSTypeAssertion) &&
    parent.expression === child
  );
}

function accessCanBeNullish(member: TSESTree.MemberExpression): boolean {
  let current: TSESTree.Node = member;
  while (
    current.type === AST_NODE_TYPES.MemberExpression ||
    current.type === AST_NODE_TYPES.CallExpression ||
    current.type === AST_NODE_TYPES.ChainExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression ||
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    current.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    if (
      (current.type === AST_NODE_TYPES.MemberExpression ||
        current.type === AST_NODE_TYPES.CallExpression) &&
      current.optional
    ) {
      return true;
    }
    if (
      current.type === AST_NODE_TYPES.MemberExpression ||
      current.type === AST_NODE_TYPES.CallExpression
    ) {
      current =
        current.type === AST_NODE_TYPES.MemberExpression
          ? current.object
          : current.callee;
      continue;
    }
    current = current.expression;
  }
  return false;
}

export default rule;
