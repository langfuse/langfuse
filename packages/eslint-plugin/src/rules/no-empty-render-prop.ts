import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

type Options = [
  {
    attributeNamePattern: string;
  },
];

const DEFAULT_ATTRIBUTE_NAME_PATTERN = "^(?:children|render.*)$";

function attributeNamePattern(pattern: string): RegExp {
  try {
    return new RegExp(pattern);
  } catch {
    return new RegExp(DEFAULT_ATTRIBUTE_NAME_PATTERN);
  }
}

function unwrap(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    current.type === AST_NODE_TYPES.TSAsExpression ||
    current.type === AST_NODE_TYPES.TSNonNullExpression
  ) {
    current = current.expression;
  }
  return current;
}

function isDefinitelyEmpty(node: TSESTree.Expression): boolean {
  const current = unwrap(node);
  if (current.type === AST_NODE_TYPES.Literal) {
    return current.value === null || current.value === false;
  }
  if (current.type === AST_NODE_TYPES.Identifier) {
    return current.name === "undefined";
  }
  if (current.type === AST_NODE_TYPES.UnaryExpression) {
    return current.operator === "void";
  }
  if (current.type === AST_NODE_TYPES.ConditionalExpression) {
    return (
      isDefinitelyEmpty(current.consequent) &&
      isDefinitelyEmpty(current.alternate)
    );
  }
  if (current.type === AST_NODE_TYPES.LogicalExpression) {
    if (current.operator === "&&") return isDefinitelyEmpty(current.left);
    return isDefinitelyEmpty(current.left) && isDefinitelyEmpty(current.right);
  }
  if (current.type === AST_NODE_TYPES.SequenceExpression) {
    return isDefinitelyEmpty(
      current.expressions[current.expressions.length - 1]!,
    );
  }
  return false;
}

function statementIsOnlyEmpty(statement: TSESTree.Statement): boolean {
  if (statement.type === AST_NODE_TYPES.ReturnStatement) {
    return statement.argument === null || isDefinitelyEmpty(statement.argument);
  }
  if (statement.type === AST_NODE_TYPES.BlockStatement) {
    return blockIsOnlyEmpty(statement);
  }
  if (statement.type === AST_NODE_TYPES.IfStatement) {
    return (
      statementIsOnlyEmpty(statement.consequent) &&
      (statement.alternate === null ||
        statementIsOnlyEmpty(statement.alternate))
    );
  }
  if (statement.type === AST_NODE_TYPES.EmptyStatement) return true;
  return false;
}

function blockIsOnlyEmpty(block: TSESTree.BlockStatement): boolean {
  return block.body.every(statementIsOnlyEmpty);
}

function isEmptyRenderFunction(
  node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): boolean {
  if (node.body.type !== AST_NODE_TYPES.BlockStatement) {
    return isDefinitelyEmpty(node.body);
  }
  return blockIsOnlyEmpty(node.body);
}

function isRenderFunction(
  node: TSESTree.Node,
): node is TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression {
  return (
    node.type === AST_NODE_TYPES.ArrowFunctionExpression ||
    node.type === AST_NODE_TYPES.FunctionExpression
  );
}

function jsxAttributeName(
  name: TSESTree.JSXOpeningElement["name"],
): string | null {
  if (name.type === AST_NODE_TYPES.JSXIdentifier) return name.name;
  return null;
}

const rule = createRule<Options, "emptyRenderProp">({
  name: "no-empty-render-prop",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow render props whose function renders nothing.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        properties: {
          attributeNamePattern: { type: "string", minLength: 1 },
        },
      },
    ],
    messages: {
      emptyRenderProp:
        "This render prop renders nothing. Return the element it is for, or omit the prop. Do not pass an empty children function to control an overlay from outside state: render the trigger here and call its open callback. `initialState` only opens an overlay on mount from the URL or saved state.",
    },
  },
  defaultOptions: [{ attributeNamePattern: DEFAULT_ATTRIBUTE_NAME_PATTERN }],
  create(context, [{ attributeNamePattern: pattern }]) {
    const namePattern = attributeNamePattern(pattern);

    function check(node: TSESTree.Node) {
      if (!isRenderFunction(node) || !isEmptyRenderFunction(node)) return;
      context.report({ node, messageId: "emptyRenderProp" });
    }

    return {
      JSXAttribute(node) {
        if (
          !node.value ||
          node.value.type !== AST_NODE_TYPES.JSXExpressionContainer
        ) {
          return;
        }
        const name = jsxAttributeName(node.name);
        if (!name || !namePattern.test(name)) return;
        check(node.value.expression);
      },
      JSXElement(node) {
        for (const child of node.children) {
          if (child.type !== AST_NODE_TYPES.JSXExpressionContainer) continue;
          if (child.expression.type === AST_NODE_TYPES.JSXEmptyExpression) {
            continue;
          }
          check(child.expression);
        }
      },
    };
  },
});

export default rule;
