import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import {
  createComponentReturnExpressionVisitors,
  visitFunctionReturnExpressions,
} from "../react-components.js";
import { createRule } from "../util.js";

type Options = [
  {
    overlayFamilies: Array<{
      module: string;
      root: string;
      trigger: string;
      contents: string[];
    }>;
    overlayControllerFamilies: Array<{
      module: string;
      root: string;
    }>;
  },
];

type JsxRenderableNode =
  | TSESTree.Expression
  | TSESTree.JSXElement
  | TSESTree.JSXFragment;

function isDefinitelyNonRendering(node: TSESTree.Expression): boolean {
  if (node.type === AST_NODE_TYPES.Literal) {
    return node.value === null || typeof node.value === "boolean";
  }
  return node.type === AST_NODE_TYPES.Identifier && node.name === "undefined";
}

function getJsxElementName(node: TSESTree.JSXElement): string | null {
  const name = node.openingElement.name;
  if (name.type === AST_NODE_TYPES.JSXIdentifier) return name.name;
  return null;
}

function getMeaningfulChild(
  children: TSESTree.JSXChild[],
): JsxRenderableNode | null {
  const meaningful: JsxRenderableNode[] = [];

  for (const child of children) {
    if (child.type === AST_NODE_TYPES.JSXText) {
      if (child.value.trim()) return null;
      continue;
    }
    if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
      if (
        child.expression.type !== AST_NODE_TYPES.JSXEmptyExpression &&
        !isDefinitelyNonRendering(child.expression)
      ) {
        meaningful.push(child.expression);
      }
      continue;
    }
    if (child.type === AST_NODE_TYPES.JSXSpreadChild) return null;
    meaningful.push(child);
  }

  return meaningful.length === 1 ? meaningful[0] : null;
}

function isIntrinsicElement(node: TSESTree.JSXElement): boolean {
  const name = getJsxElementName(node);
  return name !== null && /^[a-z]/.test(name);
}

function getEffectiveRoots(node: JsxRenderableNode): TSESTree.JSXElement[] {
  if (
    node.type === AST_NODE_TYPES.TSAsExpression ||
    node.type === AST_NODE_TYPES.TSNonNullExpression ||
    node.type === AST_NODE_TYPES.TSSatisfiesExpression ||
    node.type === AST_NODE_TYPES.TSTypeAssertion
  ) {
    return getEffectiveRoots(node.expression);
  }
  if (node.type === AST_NODE_TYPES.ConditionalExpression) {
    return [
      ...getEffectiveRoots(node.consequent),
      ...getEffectiveRoots(node.alternate),
    ];
  }
  if (node.type === AST_NODE_TYPES.LogicalExpression) {
    return [...getEffectiveRoots(node.left), ...getEffectiveRoots(node.right)];
  }
  if (node.type === AST_NODE_TYPES.JSXFragment) {
    const child = getMeaningfulChild(node.children);
    return child ? getEffectiveRoots(child) : [];
  }
  if (node.type !== AST_NODE_TYPES.JSXElement) return [];
  if (!isIntrinsicElement(node)) return [node];

  const child = getMeaningfulChild(node.children);
  return child ? getEffectiveRoots(child) : [];
}

function expressionRendersJsx(
  node: TSESTree.Expression,
): node is TSESTree.JSXElement | TSESTree.JSXFragment {
  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment
  );
}

const MAX_CONTROLLER_TRIGGER_ELEMENTS = 5;

function countJsxElements(
  node: TSESTree.JSXElement | TSESTree.JSXFragment,
): number {
  let count = node.type === AST_NODE_TYPES.JSXElement ? 1 : 0;

  for (const child of node.children) {
    if (
      child.type === AST_NODE_TYPES.JSXElement ||
      child.type === AST_NODE_TYPES.JSXFragment
    ) {
      count += countJsxElements(child);
      continue;
    }
    if (
      child.type === AST_NODE_TYPES.JSXExpressionContainer &&
      child.expression.type !== AST_NODE_TYPES.JSXEmptyExpression
    ) {
      for (const root of getEffectiveRoots(child.expression)) {
        count += countJsxElements(root);
      }
    }
  }

  return count;
}

function isInteractiveElement(node: TSESTree.JSXElement): boolean {
  const name = getJsxElementName(node);
  if (!name) return false;
  if (name === "button" || name === "a" || name === "input") return true;

  return /(Button|Trigger|Link|Item|Switch)$/.test(name);
}

function containsInteractiveElement(
  node: TSESTree.JSXElement | TSESTree.JSXFragment,
): boolean {
  if (node.type === AST_NODE_TYPES.JSXElement && isInteractiveElement(node)) {
    return true;
  }

  for (const child of node.children) {
    if (
      child.type === AST_NODE_TYPES.JSXElement ||
      child.type === AST_NODE_TYPES.JSXFragment
    ) {
      if (containsInteractiveElement(child)) return true;
      continue;
    }
    if (
      child.type === AST_NODE_TYPES.JSXExpressionContainer &&
      child.expression.type !== AST_NODE_TYPES.JSXEmptyExpression
    ) {
      if (
        getEffectiveRoots(child.expression).some(containsInteractiveElement)
      ) {
        return true;
      }
    }
  }

  return false;
}

function controllerOwnsTriggerPresentation(node: TSESTree.JSXElement): boolean {
  const child = getMeaningfulChild(node.children);
  if (
    child?.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
    child?.type !== AST_NODE_TYPES.FunctionExpression
  ) {
    return false;
  }

  let ownsTriggerPresentation = false;
  visitFunctionReturnExpressions(child, (returnExpression) => {
    if (!expressionRendersJsx(returnExpression)) return;

    if (
      countJsxElements(returnExpression) <= MAX_CONTROLLER_TRIGGER_ELEMENTS &&
      containsInteractiveElement(returnExpression)
    ) {
      ownsTriggerPresentation = true;
    }
  });
  return ownsTriggerPresentation;
}

function jsxSubtreeContainsName(
  node: TSESTree.JSXElement | TSESTree.JSXFragment,
  names: Set<string>,
): boolean {
  if (node.type === AST_NODE_TYPES.JSXElement) {
    const name = getJsxElementName(node);
    if (name && names.has(name)) return true;
  }

  for (const child of node.children) {
    if (
      child.type === AST_NODE_TYPES.JSXElement ||
      child.type === AST_NODE_TYPES.JSXFragment
    ) {
      if (jsxSubtreeContainsName(child, names)) return true;
      continue;
    }
    if (
      child.type === AST_NODE_TYPES.JSXExpressionContainer &&
      child.expression.type !== AST_NODE_TYPES.JSXEmptyExpression
    ) {
      for (const root of getEffectiveRoots(child.expression)) {
        if (jsxSubtreeContainsName(root, names)) return true;
      }
    }
  }

  return false;
}

const rule = createRule<Options, "abstractedTrigger">({
  name: "no-abstracted-overlay-trigger",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow components that abstract an overlay trigger and its floating content together.",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        required: ["overlayFamilies", "overlayControllerFamilies"],
        properties: {
          overlayFamilies: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["module", "root", "trigger", "contents"],
              properties: {
                module: { type: "string", minLength: 1 },
                root: { type: "string", minLength: 1 },
                trigger: { type: "string", minLength: 1 },
                contents: {
                  type: "array",
                  minItems: 1,
                  items: { type: "string", minLength: 1 },
                },
              },
            },
          },
          overlayControllerFamilies: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["module", "root"],
              properties: {
                module: { type: "string", minLength: 1 },
                root: { type: "string", minLength: 1 },
              },
            },
          },
        },
      },
    ],
    messages: {
      abstractedTrigger:
        "Do not abstract `{{overlay}}` trigger and content together. Keep the trigger in the parent tree and expose the overlay behavior through a controller/render prop.",
    },
  },
  defaultOptions: [{ overlayFamilies: [], overlayControllerFamilies: [] }],
  create(context, [{ overlayFamilies, overlayControllerFamilies }]) {
    const localImports = new Map<string, string>();

    const returnVisitors = createComponentReturnExpressionVisitors({
      onReturnExpression(node) {
        for (const rootNode of getEffectiveRoots(node)) {
          const localRootName = getJsxElementName(rootNode);
          if (!localRootName) continue;

          for (const family of overlayControllerFamilies) {
            if (
              localImports.get(`${family.module}:${family.root}`) ===
                localRootName &&
              controllerOwnsTriggerPresentation(rootNode)
            ) {
              context.report({
                node: rootNode.openingElement,
                messageId: "abstractedTrigger",
                data: { overlay: family.root },
              });
            }
          }

          for (const family of overlayFamilies) {
            if (
              localImports.get(`${family.module}:${family.root}`) !==
              localRootName
            ) {
              continue;
            }

            const localTrigger = localImports.get(
              `${family.module}:${family.trigger}`,
            );
            const localContents = family.contents
              .map((content) => localImports.get(`${family.module}:${content}`))
              .filter((content): content is string => content !== undefined);
            if (!localTrigger || localContents.length === 0) continue;
            if (!jsxSubtreeContainsName(rootNode, new Set([localTrigger]))) {
              continue;
            }
            if (!jsxSubtreeContainsName(rootNode, new Set(localContents))) {
              continue;
            }

            context.report({
              node: rootNode.openingElement,
              messageId: "abstractedTrigger",
              data: { overlay: family.root },
            });
          }
        }
      },
    });

    return {
      ImportDeclaration(node) {
        const family = overlayFamilies.find(
          ({ module }) => module === node.source.value,
        );
        const controllerFamily = overlayControllerFamilies.find(
          ({ module }) => module === node.source.value,
        );
        if (!family && !controllerFamily) {
          return;
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) continue;
          const importedName =
            specifier.imported.type === AST_NODE_TYPES.Identifier
              ? specifier.imported.name
              : String(specifier.imported.value);
          localImports.set(
            `${node.source.value}:${importedName}`,
            specifier.local.name,
          );
        }
      },
      ...returnVisitors,
    };
  },
});

export default rule;
