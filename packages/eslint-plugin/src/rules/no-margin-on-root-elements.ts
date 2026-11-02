import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createComponentRootElementVisitors } from "../react-components.js";
import {
  getStaticPropertyKeyValue,
  getStaticStringValue,
} from "../rule-helpers/ast.js";
import {
  extractTailwindUtilityTokens,
  normalizeTailwindToken,
  stripTailwindVariants,
} from "../rule-helpers/tailwind.js";
import { createRule } from "../util.js";

const FORBIDDEN_STYLE_PROPERTIES = new Set([
  "margin",
  "margin-block",
  "margin-block-end",
  "margin-block-start",
  "marginBlock",
  "marginBlockEnd",
  "marginBlockStart",
  "marginBottom",
  "margin-bottom",
  "margin-inline",
  "margin-inline-end",
  "margin-inline-start",
  "marginInline",
  "marginInlineEnd",
  "marginInlineStart",
  "marginLeft",
  "margin-left",
  "marginRight",
  "margin-right",
  "marginTop",
  "margin-top",
]);

const MARGIN_UTILITY_RE = /^(-?m[trblxyse]?)-(.+)$/;
const ZERO_CSS_VALUE_RE = /^-?0(?:\.0+)?(?:%|[a-z]+)?$/i;
const DEFAULT_CLASS_NAME_FUNCTIONS = ["cn", "clsx"];

type Options = [{ classNameFunctions: string[] }];
type MessageIds = "unexpectedClassName" | "unexpectedStyle";

function isZeroCssValue(value: string): boolean {
  return ZERO_CSS_VALUE_RE.test(value.trim());
}

function getReportableMarginUtility(rawToken: string): string | null {
  const utility = normalizeTailwindToken(stripTailwindVariants(rawToken));
  const match = MARGIN_UTILITY_RE.exec(utility);
  if (!match) return null;

  const value = match[2];
  if (value === "0") return null;
  if (value.startsWith("[") && value.endsWith("]")) {
    return isZeroCssValue(value.slice(1, -1)) ? null : utility;
  }

  return utility;
}
function getCallExpressionName(node: TSESTree.CallExpression): string | null {
  return node.callee.type === AST_NODE_TYPES.Identifier
    ? node.callee.name
    : null;
}

function findReportableMarginUtilityInExpression(
  node: TSESTree.Expression | TSESTree.SpreadElement,
  classNameFunctions: Set<string>,
): string | null {
  const value = getStaticStringValue(node);
  if (value !== null) {
    return findReportableMarginUtility(value);
  }

  switch (node.type) {
    case AST_NODE_TYPES.ArrayExpression: {
      for (const element of node.elements) {
        if (!element) continue;
        const utility = findReportableMarginUtilityInExpression(
          element,
          classNameFunctions,
        );
        if (utility !== null) return utility;
      }
      return null;
    }
    case AST_NODE_TYPES.CallExpression: {
      const functionName = getCallExpressionName(node);
      if (!functionName || !classNameFunctions.has(functionName)) return null;

      for (const argument of node.arguments) {
        const utility = findReportableMarginUtilityInExpression(
          argument,
          classNameFunctions,
        );
        if (utility !== null) return utility;
      }
      return null;
    }
    case AST_NODE_TYPES.ObjectExpression: {
      for (const property of node.properties) {
        if (property.type !== AST_NODE_TYPES.Property) continue;
        const key = getStaticPropertyKeyValue(property.key);
        if (!key) continue;
        const utility = findReportableMarginUtility(key);
        if (utility !== null) return utility;
      }
      return null;
    }
    case AST_NODE_TYPES.ConditionalExpression:
      return (
        findReportableMarginUtilityInExpression(
          node.consequent,
          classNameFunctions,
        ) ??
        findReportableMarginUtilityInExpression(
          node.alternate,
          classNameFunctions,
        )
      );
    case AST_NODE_TYPES.LogicalExpression:
      return (
        findReportableMarginUtilityInExpression(
          node.left,
          classNameFunctions,
        ) ??
        findReportableMarginUtilityInExpression(node.right, classNameFunctions)
      );
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      return findReportableMarginUtilityInExpression(
        node.expression,
        classNameFunctions,
      );
    default:
      return null;
  }
}

function getReportableClassNameMarginUtility(
  attribute: TSESTree.JSXAttribute,
  classNameFunctions: Set<string>,
): string | null {
  const value = attribute.value;
  if (!value) return null;

  if (
    value.type === AST_NODE_TYPES.Literal &&
    typeof value.value === "string"
  ) {
    return findReportableMarginUtility(value.value);
  }

  if (value.type !== AST_NODE_TYPES.JSXExpressionContainer) return null;
  const expression = value.expression;
  if (expression.type === AST_NODE_TYPES.JSXEmptyExpression) return null;

  return findReportableMarginUtilityInExpression(
    expression,
    classNameFunctions,
  );
}

function getPropertyName(
  key: TSESTree.PropertyName | TSESTree.PrivateIdentifier,
): string | null {
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === "string") {
    return key.value;
  }
  return null;
}

function isZeroStyleValue(node: TSESTree.Node): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    if (node.value === 0) return true;
    if (typeof node.value === "string") return isZeroCssValue(node.value);
  }

  if (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0
  ) {
    const cooked = node.quasis[0].value.cooked;
    return cooked !== null && isZeroCssValue(cooked);
  }

  return false;
}

function findReportableMarginUtility(value: string): string | null {
  for (const token of extractTailwindUtilityTokens(value)) {
    const utility = getReportableMarginUtility(token);
    if (utility) return utility;
  }
  return null;
}

const rule = createRule<Options, MessageIds>({
  name: "no-margin-on-root-elements",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow margin styles on component root elements. Parent layout components should own spacing between siblings.",
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
      unexpectedClassName:
        "Avoid margin utility `{{utility}}` on a component root element. Margin should be owned by the parent layout component.",
      unexpectedStyle:
        "Avoid `{{propertyName}}` on a component root element. Margin should be owned by the parent layout component.",
    },
  },
  defaultOptions: [{ classNameFunctions: DEFAULT_CLASS_NAME_FUNCTIONS }],
  create(context, [{ classNameFunctions }]) {
    const classNameFunctionNames = new Set(classNameFunctions);

    function checkClassName(attribute: TSESTree.JSXAttribute): void {
      const utility = getReportableClassNameMarginUtility(
        attribute,
        classNameFunctionNames,
      );
      if (!utility) return;

      context.report({
        node: attribute,
        messageId: "unexpectedClassName",
        data: { utility },
      });
    }

    function checkStyle(attribute: TSESTree.JSXAttribute): void {
      const value = attribute.value;
      if (value?.type !== AST_NODE_TYPES.JSXExpressionContainer) return;
      const expression = value.expression;
      if (expression.type !== AST_NODE_TYPES.ObjectExpression) return;

      for (const property of expression.properties) {
        if (property.type !== AST_NODE_TYPES.Property) continue;
        const propertyName = getPropertyName(property.key);
        if (!propertyName || !FORBIDDEN_STYLE_PROPERTIES.has(propertyName)) {
          continue;
        }
        if (isZeroStyleValue(property.value)) continue;

        context.report({
          node: property.key,
          messageId: "unexpectedStyle",
          data: { propertyName },
        });
      }
    }

    return createComponentRootElementVisitors({
      onRootElement(node) {
        for (const attribute of node.openingElement.attributes) {
          if (attribute.type !== AST_NODE_TYPES.JSXAttribute) continue;
          if (attribute.name.type !== AST_NODE_TYPES.JSXIdentifier) continue;

          if (attribute.name.name === "className") checkClassName(attribute);
          if (attribute.name.name === "style") checkStyle(attribute);
        }
      },
    });
  },
});

export default rule;
