import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createComponentReturnExpressionVisitors } from "../react-components.js";
import { createRule } from "../util.js";

const OVERLAY_FAMILIES = [
  {
    module: "@/src/components/ui/dialog",
    root: "Dialog",
    trigger: "DialogTrigger",
    contents: ["DialogContent"],
  },
  {
    module: "@/src/components/ui/alert-dialog",
    root: "AlertDialog",
    trigger: "AlertDialogTrigger",
    contents: ["AlertDialogContent"],
  },
  {
    module: "@/src/components/ui/dropdown-menu",
    root: "DropdownMenu",
    trigger: "DropdownMenuTrigger",
    contents: ["DropdownMenuContent", "DropdownMenuSubContent"],
  },
  {
    module: "@/src/components/ui/drawer",
    root: "Drawer",
    trigger: "DrawerTrigger",
    contents: ["DrawerContent"],
  },
  {
    module: "@/src/components/ui/popover",
    root: "Popover",
    trigger: "PopoverTrigger",
    contents: ["PopoverContent"],
  },
  {
    module: "@/src/components/ui/sheet",
    root: "Sheet",
    trigger: "SheetTrigger",
    contents: ["SheetContent"],
  },
] as const;

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

const rule = createRule<[], "abstractedTrigger">({
  name: "no-abstracted-overlay-trigger",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow components that abstract an overlay trigger and its floating content together.",
    },
    schema: [],
    messages: {
      abstractedTrigger:
        "Do not abstract `{{overlay}}` trigger and content together. Keep the trigger in the parent tree and expose the overlay behavior through a controller/render prop.",
    },
  },
  defaultOptions: [],
  create(context) {
    const localImports = new Map<string, string>();

    const returnVisitors = createComponentReturnExpressionVisitors({
      onReturnExpression(node) {
        for (const rootNode of getEffectiveRoots(node)) {
          const localRootName = getJsxElementName(rootNode);
          if (!localRootName) continue;

          for (const family of OVERLAY_FAMILIES) {
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
        const family = OVERLAY_FAMILIES.find(
          ({ module }) => module === node.source.value,
        );
        if (!family) return;

        for (const specifier of node.specifiers) {
          if (specifier.type !== AST_NODE_TYPES.ImportSpecifier) continue;
          const importedName =
            specifier.imported.type === AST_NODE_TYPES.Identifier
              ? specifier.imported.name
              : String(specifier.imported.value);
          localImports.set(
            `${family.module}:${importedName}`,
            specifier.local.name,
          );
        }
      },
      ...returnVisitors,
    };
  },
});

export default rule;
