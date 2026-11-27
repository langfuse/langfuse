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
      // Selector keeps non-length members out of this callback.
      "MemberExpression[property.name='length']"(
        node: TSESTree.MemberExpression,
      ) {
        if (node.computed || node.property.type !== AST_NODE_TYPES.Identifier)
          return;

        const use = booleanUse(node);
        if (!use) return;

        context.report({
          node,
          messageId: "lengthAsBoolean",
          fix(fixer) {
            // Optional chains, `??`, and casts are reported only. A rewritten
            // comparison does not preserve null or the original value.
            if (accessCanBeNullish(node)) return null;
            const expression = liftSequence(unwrapTransparent(node));
            if (isTypeWrapper(expression)) return null;

            const lengthText = sourceCode.getText(node);

            if (use === "negated" || use === "double-negated") {
              const inner = parentOf(expression);
              const outer = inner.parent;
              const target =
                use === "double-negated" &&
                outer?.type === AST_NODE_TYPES.UnaryExpression
                  ? outer
                  : inner;
              if (hasCommentInside(sourceCode, target)) return null;
              const comparison =
                use === "negated"
                  ? `(${lengthText} === 0)`
                  : `(${lengthText} > 0)`;
              return fixer.replaceText(target, comparison);
            }

            if (!truthyFixPreservesValue(expression)) return null;
            if (comparisonWouldBindInsideNullish(node)) return null;
            if (hasCommentInside(sourceCode, node)) return null;
            return fixer.replaceText(node, `${lengthText} > 0`);
          },
        });
      },
    };
  },
});

const PREDICATE_METHODS = new Set([
  "filter",
  "some",
  "every",
  "find",
  "findLast",
  "findIndex",
]);

function hasCommentInside(
  sourceCode: { getCommentsInside: (node: TSESTree.Node) => unknown[] },
  node: TSESTree.Node,
): boolean {
  return sourceCode.getCommentsInside(node).length > 0;
}

function isTypeWrapper(expression: TSESTree.Node): boolean {
  return (
    expression.type === AST_NODE_TYPES.TSAsExpression ||
    expression.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    expression.type === AST_NODE_TYPES.TSTypeAssertion ||
    expression.type === AST_NODE_TYPES.TSNonNullExpression
  );
}

function parentOf(node: TSESTree.Node): TSESTree.Node {
  return node.parent as TSESTree.Node;
}

function booleanUse(member: TSESTree.MemberExpression): BooleanUse | null {
  const expression = liftSequence(unwrapTransparent(member));
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
  if (isBooleanCall(parent, expression)) return "truthy";
  if (isPredicateBody(expression)) return "truthy";

  if (!isAndOr(parent) && !isNullish(parent)) return null;

  if (isAndOr(parent) && parent.left === expression) {
    // `length || fallback` and `count={length || n}` yield the number.
    if (parent.operator === "||" && !resultUsedAsBoolean(parent)) return null;
    // A prop receives the value, including nested `length && flag && extra`.
    // A child `{length && <List />}` renders 0.
    if (attributeOwns(parent)) return null;
    return "truthy";
  }

  // `{flag && items.length}` renders the count. That operand is not a test.
  if (
    isAndOr(parent) &&
    parent.operator === "&&" &&
    parent.right === expression &&
    isJsxChild(parent)
  ) {
    return null;
  }

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
  if (isJsxChildContainer(parent, expression)) {
    // `{count ?? 0}` renders a number. `{items.length && <List />}` renders 0
    // because the length is the condition. The value operand is not a test.
    return isAndOr(expression) && expression.operator === "&&";
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
function truthyFixPreservesValue(expression: TSESTree.Node): boolean {
  const parent = parentOf(expression);
  if (isDirectTest(parent, expression)) return true;
  if (isBooleanCall(parent, expression)) return true;
  if (isPredicateBody(expression)) return true;
  if (
    isAndOr(parent) &&
    parent.operator === "&&" &&
    parent.left === expression &&
    isJsxChild(parent)
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

function liftSequence(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  let parent = parentOf(current);
  while (
    parent.type === AST_NODE_TYPES.SequenceExpression &&
    parent.expressions[parent.expressions.length - 1] === current
  ) {
    current = parent;
    parent = parentOf(current);
  }
  return current;
}

function isBooleanCall(
  parent: TSESTree.Node,
  expression: TSESTree.Node,
): boolean {
  return (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments.length === 1 &&
    parent.arguments[0] === expression &&
    parent.callee.type === AST_NODE_TYPES.Identifier &&
    parent.callee.name === "Boolean"
  );
}

function isPredicateBody(expression: TSESTree.Node): boolean {
  const parent = parentOf(expression);
  if (
    (parent.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
      parent.type !== AST_NODE_TYPES.FunctionExpression) ||
    parent.body !== expression
  ) {
    return false;
  }
  const call = parent.parent;
  if (call?.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = call.callee;
  if (callee.type === AST_NODE_TYPES.Identifier) {
    return PREDICATE_METHODS.has(callee.name);
  }
  return (
    callee.type === AST_NODE_TYPES.MemberExpression &&
    !callee.computed &&
    callee.property.type === AST_NODE_TYPES.Identifier &&
    PREDICATE_METHODS.has(callee.property.name)
  );
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

/** `length > 0 ?? fallback` parses as `(length > 0) ?? fallback` and drops the fallback. */
function comparisonWouldBindInsideNullish(member: TSESTree.Node): boolean {
  const parent = parentOf(member);
  return isNullish(parent) && parent.left === member;
}

function isJsxChild(expression: TSESTree.Node): boolean {
  return isJsxChildContainer(
    parentOf(unwrapTransparent(expression)),
    unwrapTransparent(expression),
  );
}

function isJsxChildContainer(
  parent: TSESTree.Node,
  expression: TSESTree.Node,
): boolean {
  if (
    parent.type !== AST_NODE_TYPES.JSXExpressionContainer ||
    parent.expression !== expression
  ) {
    return false;
  }
  const owner = parent.parent;
  return (
    owner?.type === AST_NODE_TYPES.JSXElement ||
    owner?.type === AST_NODE_TYPES.JSXFragment
  );
}

/** True when `expression` is the value of a JSX prop, through nested && / || / ??. */
function attributeOwns(expression: TSESTree.Node): boolean {
  let current = expression;
  for (;;) {
    if (isJsxAttributeExpression(current)) return true;
    const parent = parentOf(unwrapTransparent(current));
    if (!isAndOr(parent) && !isNullish(parent)) return false;
    current = parent;
  }
}

function isJsxAttributeExpression(expression: TSESTree.Node): boolean {
  const unwrapped = unwrapTransparent(expression);
  const parent = parentOf(unwrapped);
  return (
    parent.type === AST_NODE_TYPES.JSXExpressionContainer &&
    parent.expression === unwrapped &&
    parent.parent?.type === AST_NODE_TYPES.JSXAttribute
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
