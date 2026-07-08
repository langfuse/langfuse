import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import {
  getStaticPropertyKeyValue,
  getStaticStringValue,
} from "../rule-helpers/ast.js";
import { hasTailwindUtility } from "../rule-helpers/tailwind.js";
import { createRule } from "../util.js";

const DEFAULT_CLASS_NAME_FUNCTIONS = ["cn", "clsx"];
const TRUNCATE_UTILITY = "truncate";

type Options = [{ classNameFunctions: string[] }];
type MessageIds = "missingTitle";

function containsTruncateToken(value: string): boolean {
  return hasTailwindUtility(value, TRUNCATE_UTILITY);
}

const rule = createRule<Options, MessageIds>({
  name: "require-title-with-truncate",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require a title attribute on JSX elements that use the truncate utility.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        required: ["classNameFunctions"],
        properties: {
          classNameFunctions: {
            type: "array",
            items: { type: "string", minLength: 1 },
            uniqueItems: true,
          },
        },
      },
    ],
    messages: {
      missingTitle:
        "Elements using `truncate` must also set a `title` attribute so the full text remains available.",
    },
  },
  defaultOptions: [{ classNameFunctions: DEFAULT_CLASS_NAME_FUNCTIONS }],
  create(context, [{ classNameFunctions }]) {
    const classNameFunctionNames = new Set(classNameFunctions);

    function expressionContainsTruncate(
      node: TSESTree.Expression | TSESTree.SpreadElement,
    ): boolean {
      const staticValue = getStaticStringValue(node);
      if (staticValue !== null) {
        return containsTruncateToken(staticValue);
      }

      switch (node.type) {
        case AST_NODE_TYPES.ArrayExpression:
          return node.elements.some(
            (element) => element && expressionContainsTruncate(element),
          );
        case AST_NODE_TYPES.CallExpression: {
          if (
            node.callee.type === AST_NODE_TYPES.Identifier &&
            classNameFunctionNames.has(node.callee.name)
          ) {
            return node.arguments.some((argument) =>
              expressionContainsTruncate(argument),
            );
          }

          return false;
        }
        case AST_NODE_TYPES.ObjectExpression:
          return node.properties.some((property) => {
            if (
              property.type !== AST_NODE_TYPES.Property ||
              property.computed
            ) {
              return false;
            }

            const key = getStaticPropertyKeyValue(property.key);
            return key !== null && containsTruncateToken(key);
          });
        case AST_NODE_TYPES.ConditionalExpression:
          return (
            expressionContainsTruncate(node.consequent) ||
            expressionContainsTruncate(node.alternate)
          );
        case AST_NODE_TYPES.LogicalExpression:
          return (
            expressionContainsTruncate(node.left) ||
            expressionContainsTruncate(node.right)
          );
        case AST_NODE_TYPES.TSAsExpression:
        case AST_NODE_TYPES.TSNonNullExpression:
        case AST_NODE_TYPES.TSSatisfiesExpression:
        case AST_NODE_TYPES.TSTypeAssertion:
          return expressionContainsTruncate(node.expression);
        default:
          return false;
      }
    }

    return {
      JSXOpeningElement(node) {
        let hasTitle = false;
        let classNameAttribute: TSESTree.JSXAttribute | null = null;

        for (const attribute of node.attributes) {
          if (attribute.type !== AST_NODE_TYPES.JSXAttribute) continue;
          if (attribute.name.type !== AST_NODE_TYPES.JSXIdentifier) continue;

          if (attribute.name.name === "title") {
            if (attribute.value) {
              if (
                attribute.value.type !== AST_NODE_TYPES.JSXExpressionContainer
              ) {
                hasTitle = true;
              } else {
                const expression = attribute.value.expression;
                if (
                  expression.type !== AST_NODE_TYPES.JSXEmptyExpression &&
                  !(
                    expression.type === AST_NODE_TYPES.Literal &&
                    expression.value == null
                  )
                ) {
                  hasTitle = true;
                }
              }
            }
            continue;
          }

          if (attribute.name.name === "className") {
            classNameAttribute = attribute;
          }
        }

        if (hasTitle || !classNameAttribute) return;

        const value = classNameAttribute.value;
        if (!value) return;

        const hasTruncate =
          (value.type === AST_NODE_TYPES.Literal &&
            typeof value.value === "string" &&
            containsTruncateToken(value.value)) ||
          (value.type === AST_NODE_TYPES.JSXExpressionContainer &&
            value.expression.type !== AST_NODE_TYPES.JSXEmptyExpression &&
            expressionContainsTruncate(value.expression));

        if (!hasTruncate) return;

        context.report({
          node: classNameAttribute,
          messageId: "missingTitle",
        });
      },
    };
  },
});

export default rule;
