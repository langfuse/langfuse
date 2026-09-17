import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";
import { extractTailwindUtilityTokens } from "../rule-helpers/tailwind.js";

// The app uses an icon size scale (icon-sm/icon-md/icon-lg, 12/14/16px) so
// lucide-react icons stay visually consistent across the product. Raw
// Tailwind height/width/size utilities and numeric `size` props that land on
// one of those three pixel values escape the scale, even though other raw
// sizes (h-5, size-6, size={20}) are deliberate exceptions and stay allowed.
const FORBIDDEN_ICON_SIZE_CLASSES = new Set([
  "h-3",
  "w-3",
  "h-3.5",
  "w-3.5",
  "h-4",
  "w-4",
  "size-3",
  "size-3.5",
  "size-4",
]);

const FORBIDDEN_ICON_SIZE_PROP_VALUES = new Set([12, 14, 16]);

function classNameValueHasForbiddenSize(value: string): boolean {
  for (const utility of extractTailwindUtilityTokens(value)) {
    if (FORBIDDEN_ICON_SIZE_CLASSES.has(utility)) return true;
  }
  return false;
}

function classNameExpressionHasForbiddenSize(
  node: TSESTree.Expression,
): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    return (
      typeof node.value === "string" && classNameValueHasForbiddenSize(node.value)
    );
  }

  if (node.type === AST_NODE_TYPES.TemplateLiteral) {
    return node.quasis.some((quasi) =>
      classNameValueHasForbiddenSize(quasi.value.raw),
    );
  }

  if (
    node.type === AST_NODE_TYPES.CallExpression &&
    node.callee.type === AST_NODE_TYPES.Identifier &&
    node.callee.name === "cn"
  ) {
    return node.arguments.some(
      (argument) =>
        argument.type !== AST_NODE_TYPES.SpreadElement &&
        classNameExpressionHasForbiddenSize(argument),
    );
  }

  return false;
}

function hasForbiddenClassName(attribute: TSESTree.JSXAttribute): boolean {
  const value = attribute.value;
  if (!value) return false;

  if (value.type === AST_NODE_TYPES.Literal) {
    return (
      typeof value.value === "string" &&
      classNameValueHasForbiddenSize(value.value)
    );
  }

  if (value.type !== AST_NODE_TYPES.JSXExpressionContainer) return false;
  const expression = value.expression;
  if (expression.type === AST_NODE_TYPES.JSXEmptyExpression) return false;

  return classNameExpressionHasForbiddenSize(expression);
}

function getNumericLiteralValue(node: TSESTree.Expression): number | null {
  if (node.type !== AST_NODE_TYPES.Literal) return null;
  if (typeof node.value === "number") return node.value;
  if (typeof node.value === "string") {
    const parsed = Number(node.value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function hasForbiddenSizeProp(attribute: TSESTree.JSXAttribute): boolean {
  const value = attribute.value;
  if (!value) return false;

  let expression: TSESTree.Expression | null = null;
  if (value.type === AST_NODE_TYPES.Literal) {
    expression = value;
  } else if (value.type === AST_NODE_TYPES.JSXExpressionContainer) {
    if (value.expression.type === AST_NODE_TYPES.JSXEmptyExpression) {
      return false;
    }
    expression = value.expression;
  }
  if (!expression) return false;

  const numericValue = getNumericLiteralValue(expression);
  return numericValue !== null && FORBIDDEN_ICON_SIZE_PROP_VALUES.has(numericValue);
}

const rule = createRule({
  name: "no-raw-icon-size",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw Tailwind size utilities and numeric `size` props on lucide-react icons outside the icon size scale (icon-sm/icon-md/icon-lg).",
    },
    schema: [],
    messages: {
      unexpected:
        "Use the icon size scale: icon-sm (12px), icon-md (14px), icon-lg (16px) instead of raw sizes.",
    },
  },
  defaultOptions: [],
  create(context) {
    const lucideLocalNames = new Set<string>();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== "lucide-react") return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) continue;
          lucideLocalNames.add(specifier.local.name);
        }
      },
      JSXOpeningElement(node) {
        const name = node.name;
        if (name.type !== AST_NODE_TYPES.JSXIdentifier) return;
        if (!lucideLocalNames.has(name.name)) return;

        for (const attribute of node.attributes) {
          if (attribute.type !== AST_NODE_TYPES.JSXAttribute) continue;
          if (attribute.name.type !== AST_NODE_TYPES.JSXIdentifier) continue;

          if (
            attribute.name.name === "className" &&
            hasForbiddenClassName(attribute)
          ) {
            context.report({ node: attribute, messageId: "unexpected" });
            continue;
          }

          if (
            attribute.name.name === "size" &&
            hasForbiddenSizeProp(attribute)
          ) {
            context.report({ node: attribute, messageId: "unexpected" });
          }
        }
      },
    };
  },
});

export default rule;
