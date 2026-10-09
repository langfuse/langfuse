import {
  AST_NODE_TYPES,
  ASTUtils,
  type TSESTree,
} from "@typescript-eslint/utils";

import { createRule } from "../util.js";
import {
  extractTailwindUtilityTokens,
  normalizeTailwindToken,
  stripTailwindVariants,
} from "../rule-helpers/tailwind.js";

// The icon scale: icon-sm 12px, icon-base 14px, icon-lg 20px, icon-xl 28px.
// Illustrations at 40px and above keep raw sizes.
const ILLUSTRATION_MIN_PX = 40;
const TAILWIND_SPACING_PX = 4;
const ROOT_FONT_SIZE_PX = 16;
const RAW_ICON_SIZE_CLASS = /^(?:h|w|size)-(\d+(?:\.\d+)?|px|\[.*\])$/;
const ARBITRARY_LENGTH = /^\[(\d+(?:\.\d+)?)(px|rem)\]$/;
const RETIRED_ICON_SIZE_CLASSES = new Set(["icon-md"]);
const ICON_SCALE_CLASSES = new Set([
  "icon-sm",
  "icon-base",
  "icon-lg",
  "icon-xl",
]);
const EXPLICIT_SIZE_CLASS = /^(?:h|w|size)-/;
const SVG_SELECTOR_VARIANT = /\[&[^\]]*svg/;
// Class-string holders that exist to size an icon.
const ICON_CLASS_HOLDER_NAME =
  /^icon(?:class(?:name)?|cls|variants?|styles?)?$|iconclass(?:name)?$/i;
const ICON_CLASS_PROP_NAME = /iconclass(?:name)?$/i;
const ICON_IMPORT_SOURCE = /^(?:lucide-react|react-icons\/.+)$/;
// Icon components passed in as props or variables: `Icon`, `TrailingIcon`.
const LOCAL_ICON_COMPONENT_NAME = /^(?:[A-Z]\w*)?Icon$/;
// Icon components read from an object: `item.icon`, `group.icon`.
const MEMBER_ICON_PROPERTY_NAME = /^(?:icon|\w*Icon)$/;

type Options = [{ exceptions?: string[]; requireSize?: boolean }];
type MessageIds = "unexpected" | "strokeWidth" | "svgSelector" | "missingSize";
// "unknown": the class value cannot be resolved statically.
type SizeState = "sized" | "unsized" | "unknown";

function rawSizeToPx(size: string): number | null {
  if (size === "px") return 1;
  if (!size.startsWith("[")) return Number(size) * TAILWIND_SPACING_PX;
  const match = ARBITRARY_LENGTH.exec(size);
  if (!match) return null;
  const value = Number(match[1]);
  return match[2] === "rem" ? value * ROOT_FONT_SIZE_PX : value;
}

function isIllustrationSize(px: number | null): boolean {
  return px !== null && px >= ILLUSTRATION_MIN_PX;
}

function utilityIsForbiddenSize(utility: string): boolean {
  if (RETIRED_ICON_SIZE_CLASSES.has(utility)) return true;
  const match = RAW_ICON_SIZE_CLASS.exec(utility);
  if (!match) return false;
  return !isIllustrationSize(rawSizeToPx(match[1]));
}

function classNameValueHasForbiddenSize(value: string): boolean {
  for (const utility of extractTailwindUtilityTokens(value)) {
    if (utilityIsForbiddenSize(utility)) return true;
  }
  return false;
}

function svgSelectorValueHasForbiddenSize(value: string): boolean {
  if (!value.includes("svg")) return false;
  for (const match of value.matchAll(/\S+/g)) {
    const token = match[0];
    const utility = normalizeTailwindToken(stripTailwindVariants(token));
    const variants = token.slice(0, token.length - utility.length);
    if (
      SVG_SELECTOR_VARIANT.test(variants) &&
      utilityIsForbiddenSize(utility)
    ) {
      return true;
    }
  }
  return false;
}

function classNameValueHasExplicitSize(value: string): boolean {
  for (const utility of extractTailwindUtilityTokens(value)) {
    if (ICON_SCALE_CLASSES.has(utility) || EXPLICIT_SIZE_CLASS.test(utility)) {
      return true;
    }
  }
  return false;
}

function combineSizeStates(states: SizeState[]): SizeState {
  if (states.includes("sized")) return "sized";
  if (states.includes("unknown")) return "unknown";
  return "unsized";
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

function attributeExpression(
  attribute: TSESTree.JSXAttribute,
): TSESTree.Expression | null {
  const value = attribute.value;
  if (!value) return null;
  if (value.type === AST_NODE_TYPES.Literal) return value;
  if (value.type !== AST_NODE_TYPES.JSXExpressionContainer) return null;
  if (value.expression.type === AST_NODE_TYPES.JSXEmptyExpression) return null;
  return value.expression;
}

const CLASS_EXPRESSION_TYPES = new Set<AST_NODE_TYPES>([
  AST_NODE_TYPES.Literal,
  AST_NODE_TYPES.TemplateLiteral,
  AST_NODE_TYPES.ConditionalExpression,
  AST_NODE_TYPES.LogicalExpression,
  AST_NODE_TYPES.CallExpression,
  AST_NODE_TYPES.Identifier,
]);

function isClassExpression(node: TSESTree.Node): node is TSESTree.Expression {
  return CLASS_EXPRESSION_TYPES.has(node.type);
}

function propertyKeyName(property: TSESTree.Property): string | null {
  if (property.computed) return null;
  if (property.key.type === AST_NODE_TYPES.Identifier) return property.key.name;
  if (
    property.key.type === AST_NODE_TYPES.Literal &&
    typeof property.key.value === "string"
  ) {
    return property.key.value;
  }
  return null;
}

const rule = createRule<Options, MessageIds>({
  name: "no-raw-icon-size",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow raw Tailwind size utilities, numeric `size` props and `strokeWidth` on icons (lucide-react, react-icons, and icon components passed in as props); sizes come from the icon scale (icon-sm/icon-base/icon-lg/icon-xl). Illustrations at 40px and above keep raw sizes.",
    },
    schema: [
      {
        type: "object",
        properties: {
          exceptions: {
            type: "array",
            items: { type: "string" },
            description:
              "File path substrings whose lucide icons may keep raw sizes.",
          },
          requireSize: {
            type: "boolean",
            description:
              "Require every lucide icon to set its size explicitly instead of inheriting it from a parent.",
          },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unexpected:
        "Use the icon size scale: icon-sm (12px), icon-base (14px), icon-lg (20px) or icon-xl (28px) instead of raw sizes.",
      strokeWidth:
        "Do not set strokeWidth on lucide icons; every icon uses the lucide default.",
      svgSelector:
        "Size nested icons with [&_svg]:icon-sm / [&_svg]:icon-base / [&_svg]:icon-lg, not raw sizes.",
      missingSize:
        "Set the icon size explicitly: icon-sm (12px), icon-base (14px), icon-lg (20px) or icon-xl (28px).",
    },
  },
  defaultOptions: [{}],
  create(context, [options]) {
    const filename = context.filename.replace(/\\/g, "/");
    if (options.exceptions?.some((exception) => filename.includes(exception))) {
      return {};
    }

    const sourceCode = context.sourceCode;
    const iconImportNames = new Set<string>();
    // Reported at the declaration; a later use on an icon is the same finding.
    const reportedInits = new Set<TSESTree.Node>();

    function resolveConstInit(
      identifier: TSESTree.Identifier,
    ): TSESTree.Expression | null {
      const variable = ASTUtils.findVariable(
        sourceCode.getScope(identifier),
        identifier,
      );
      const definition = variable?.defs[0]?.node;
      if (
        !definition ||
        definition.type !== AST_NODE_TYPES.VariableDeclarator ||
        !definition.init
      ) {
        return null;
      }
      return definition.init;
    }

    function cvaStringsHaveForbiddenSize(
      node: TSESTree.Node,
      visited: Set<TSESTree.Node>,
    ): boolean {
      if (node.type === AST_NODE_TYPES.ObjectExpression) {
        return node.properties.some(
          (property) =>
            property.type === AST_NODE_TYPES.Property &&
            cvaStringsHaveForbiddenSize(property.value, visited),
        );
      }
      if (node.type === AST_NODE_TYPES.ArrayExpression) {
        return node.elements.some(
          (element) =>
            element !== null &&
            element.type !== AST_NODE_TYPES.SpreadElement &&
            cvaStringsHaveForbiddenSize(element, visited),
        );
      }
      if (
        node.type === AST_NODE_TYPES.Literal ||
        node.type === AST_NODE_TYPES.TemplateLiteral ||
        node.type === AST_NODE_TYPES.ConditionalExpression ||
        node.type === AST_NODE_TYPES.LogicalExpression ||
        node.type === AST_NODE_TYPES.CallExpression
      ) {
        return expressionHasForbiddenSize(node, visited);
      }
      return false;
    }

    function expressionHasForbiddenSize(
      node: TSESTree.Expression,
      visited: Set<TSESTree.Node> = new Set(),
    ): boolean {
      if (visited.has(node)) return false;
      visited.add(node);

      if (node.type === AST_NODE_TYPES.Literal) {
        return (
          typeof node.value === "string" &&
          classNameValueHasForbiddenSize(node.value)
        );
      }

      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        return node.quasis.some((quasi) =>
          classNameValueHasForbiddenSize(quasi.value.raw),
        );
      }

      if (node.type === AST_NODE_TYPES.ConditionalExpression) {
        return (
          expressionHasForbiddenSize(node.consequent, visited) ||
          expressionHasForbiddenSize(node.alternate, visited)
        );
      }

      if (node.type === AST_NODE_TYPES.LogicalExpression) {
        return expressionHasForbiddenSize(node.right, visited);
      }

      if (node.type === AST_NODE_TYPES.Identifier) {
        const init = resolveConstInit(node);
        if (!init || reportedInits.has(init)) return false;
        return expressionHasForbiddenSize(init, visited);
      }

      if (node.type === AST_NODE_TYPES.CallExpression) {
        if (node.callee.type !== AST_NODE_TYPES.Identifier) return false;

        if (node.callee.name === "cn") {
          return node.arguments.some(
            (argument) =>
              argument.type !== AST_NODE_TYPES.SpreadElement &&
              expressionHasForbiddenSize(argument, visited),
          );
        }

        if (node.callee.name === "cva") {
          return node.arguments.some(
            (argument) =>
              argument.type !== AST_NODE_TYPES.SpreadElement &&
              cvaStringsHaveForbiddenSize(argument, visited),
          );
        }

        // `iconVariants({ type })` where `iconVariants = cva(...)`.
        const init = resolveConstInit(node.callee);
        if (!init || reportedInits.has(init)) return false;
        if (
          init.type === AST_NODE_TYPES.CallExpression &&
          init.callee.type === AST_NODE_TYPES.Identifier &&
          init.callee.name === "cva"
        ) {
          return expressionHasForbiddenSize(init, visited);
        }
      }

      return false;
    }

    function cvaSizeState(
      node: TSESTree.Node,
      visited: Set<TSESTree.Node>,
    ): SizeState {
      if (node.type === AST_NODE_TYPES.ObjectExpression) {
        return combineSizeStates(
          node.properties.map((property) =>
            property.type === AST_NODE_TYPES.Property
              ? cvaSizeState(property.value, visited)
              : "unknown",
          ),
        );
      }
      if (node.type === AST_NODE_TYPES.ArrayExpression) {
        return combineSizeStates(
          node.elements.map((element) =>
            element === null || element.type === AST_NODE_TYPES.SpreadElement
              ? "unknown"
              : cvaSizeState(element, visited),
          ),
        );
      }
      if (node.type === AST_NODE_TYPES.Literal) {
        return classSizeState(node, visited);
      }
      if (node.type === AST_NODE_TYPES.TemplateLiteral) {
        return classSizeState(node, visited);
      }
      return "unsized";
    }

    function classSizeState(
      node: TSESTree.Expression,
      visited: Set<TSESTree.Node> = new Set(),
    ): SizeState {
      if (visited.has(node)) return "unknown";
      visited.add(node);

      switch (node.type) {
        case AST_NODE_TYPES.Literal:
          return typeof node.value === "string" &&
            classNameValueHasExplicitSize(node.value)
            ? "sized"
            : "unsized";
        case AST_NODE_TYPES.TemplateLiteral:
          if (
            node.quasis.some((quasi) =>
              classNameValueHasExplicitSize(quasi.value.raw),
            )
          ) {
            return "sized";
          }
          return node.expressions.length > 0 ? "unknown" : "unsized";
        case AST_NODE_TYPES.ConditionalExpression: {
          const branches = [
            classSizeState(node.consequent, visited),
            classSizeState(node.alternate, visited),
          ];
          if (branches.every((state) => state === "sized")) return "sized";
          return branches.includes("unknown") ? "unknown" : "unsized";
        }
        case AST_NODE_TYPES.LogicalExpression:
          return classSizeState(node.right, visited);
        case AST_NODE_TYPES.Identifier: {
          const init = resolveConstInit(node);
          return init ? classSizeState(init, visited) : "unknown";
        }
        case AST_NODE_TYPES.CallExpression: {
          if (node.callee.type !== AST_NODE_TYPES.Identifier) return "unknown";
          if (node.callee.name === "cn") {
            return combineSizeStates(
              node.arguments.map((argument) =>
                argument.type === AST_NODE_TYPES.SpreadElement
                  ? "unknown"
                  : classSizeState(argument, visited),
              ),
            );
          }
          if (node.callee.name === "cva") {
            return combineSizeStates(
              node.arguments.map((argument) =>
                argument.type === AST_NODE_TYPES.SpreadElement
                  ? "unknown"
                  : cvaSizeState(argument, visited),
              ),
            );
          }
          const init = resolveConstInit(node.callee);
          if (
            init?.type === AST_NODE_TYPES.CallExpression &&
            init.callee.type === AST_NODE_TYPES.Identifier &&
            init.callee.name === "cva"
          ) {
            return classSizeState(init, visited) === "sized"
              ? "sized"
              : "unknown";
          }
          return "unknown";
        }
        default:
          return "unknown";
      }
    }

    function iconSizeState(node: TSESTree.JSXOpeningElement): SizeState {
      const states: SizeState[] = [];
      let hasClassName = false;
      for (const attribute of node.attributes) {
        if (attribute.type === AST_NODE_TYPES.JSXSpreadAttribute) {
          states.push("unknown");
          continue;
        }
        if (attribute.name.type !== AST_NODE_TYPES.JSXIdentifier) continue;
        const attributeName = attribute.name.name;
        if (attributeName === "size") {
          const expression = attributeExpression(attribute);
          if (expression === null) continue;
          states.push(
            getNumericLiteralValue(expression) === null ? "unknown" : "sized",
          );
        }
        if (attributeName === "className") {
          hasClassName = true;
          const expression = attributeExpression(attribute);
          states.push(
            expression === null ? "unsized" : classSizeState(expression),
          );
        }
      }
      if (!hasClassName) states.push("unsized");
      return combineSizeStates(states);
    }

    function isIconComponent(name: TSESTree.JSXIdentifier): boolean {
      if (iconImportNames.has(name.name)) return true;
      if (!LOCAL_ICON_COMPONENT_NAME.test(name.name)) return false;
      const variable = ASTUtils.findVariable(
        sourceCode.getScope(name),
        name.name,
      );
      const definition = variable?.defs[0];
      if (!definition) return false;
      if (definition.type === "Parameter") return true;
      if (definition.type !== "Variable") return false;
      // A component defined in the file sizes its own icon.
      const init = definition.node.init;
      return (
        init?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
        init?.type !== AST_NODE_TYPES.FunctionExpression
      );
    }

    function hasForbiddenClassName(attribute: TSESTree.JSXAttribute): boolean {
      const expression = attributeExpression(attribute);
      return expression !== null && expressionHasForbiddenSize(expression);
    }

    function hasForbiddenSizeProp(attribute: TSESTree.JSXAttribute): boolean {
      const expression = attributeExpression(attribute);
      if (expression === null) return false;
      const px = getNumericLiteralValue(expression);
      return px !== null && !isIllustrationSize(px);
    }

    return {
      ImportDeclaration(node) {
        if (!ICON_IMPORT_SOURCE.test(String(node.source.value))) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) continue;
          iconImportNames.add(specifier.local.name);
        }
      },
      Literal(node) {
        if (
          typeof node.value === "string" &&
          svgSelectorValueHasForbiddenSize(node.value)
        ) {
          context.report({ node, messageId: "svgSelector" });
        }
      },
      TemplateLiteral(node) {
        if (
          node.quasis.some((quasi) =>
            svgSelectorValueHasForbiddenSize(quasi.value.raw),
          )
        ) {
          context.report({ node, messageId: "svgSelector" });
        }
      },
      VariableDeclarator(node) {
        if (
          node.id.type !== AST_NODE_TYPES.Identifier ||
          !ICON_CLASS_HOLDER_NAME.test(node.id.name) ||
          !node.init
        ) {
          return;
        }
        if (expressionHasForbiddenSize(node.init)) {
          reportedInits.add(node.init);
          context.report({ node, messageId: "unexpected" });
        }
      },
      Property(node) {
        if (node.parent.type === AST_NODE_TYPES.ObjectPattern) return;
        const key = propertyKeyName(node);
        if (!key || !ICON_CLASS_PROP_NAME.test(key)) return;
        if (
          isClassExpression(node.value) &&
          expressionHasForbiddenSize(node.value)
        ) {
          context.report({ node, messageId: "unexpected" });
        }
      },
      JSXOpeningElement(node) {
        const name = node.name;
        let isIcon: boolean;
        if (name.type === AST_NODE_TYPES.JSXIdentifier) {
          isIcon = isIconComponent(name);
        } else if (name.type === AST_NODE_TYPES.JSXMemberExpression) {
          // `SelectPrimitive.Icon` is a component namespace, not an icon.
          isIcon =
            name.object.type === AST_NODE_TYPES.JSXIdentifier &&
            /^[a-z]/.test(name.object.name) &&
            MEMBER_ICON_PROPERTY_NAME.test(name.property.name);
        } else {
          return;
        }
        let reportedSize = false;

        for (const attribute of node.attributes) {
          if (attribute.type !== AST_NODE_TYPES.JSXAttribute) continue;
          if (attribute.name.type !== AST_NODE_TYPES.JSXIdentifier) continue;
          const attributeName = attribute.name.name;

          if (
            ICON_CLASS_PROP_NAME.test(attributeName) &&
            hasForbiddenClassName(attribute)
          ) {
            context.report({ node: attribute, messageId: "unexpected" });
            continue;
          }

          if (!isIcon) continue;

          if (
            attributeName === "className" &&
            hasForbiddenClassName(attribute)
          ) {
            context.report({ node: attribute, messageId: "unexpected" });
            reportedSize = true;
            continue;
          }

          if (attributeName === "size" && hasForbiddenSizeProp(attribute)) {
            context.report({ node: attribute, messageId: "unexpected" });
            reportedSize = true;
            continue;
          }

          if (attributeName === "strokeWidth") {
            context.report({ node: attribute, messageId: "strokeWidth" });
          }
        }

        if (
          isIcon &&
          options.requireSize &&
          !reportedSize &&
          iconSizeState(node) === "unsized"
        ) {
          context.report({ node, messageId: "missingSize" });
        }
      },
    };
  },
});

export default rule;
