import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util.js";

type MessageIds = "noNestedTernary";

const prohibitedFixNodes = new Set<string>([
  AST_NODE_TYPES.AwaitExpression,
  AST_NODE_TYPES.YieldExpression,
]);

const isNode = (value: unknown): value is TSESTree.Node =>
  value !== null && typeof value === "object" && "type" in value;

const rule = createRule<[], MessageIds>({
  name: "no-nested-ternary",
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow nested ternary expressions.",
    },
    fixable: "code",
    schema: [],
    messages: {
      noNestedTernary: "Do not nest ternary expressions.",
    },
  },
  defaultOptions: [],
  create(context) {
    const sourceCode = context.sourceCode;

    const containsNodeType = (node: TSESTree.Node, nodeTypes: Set<string>) => {
      const nodes = [node];

      for (const current of nodes) {
        if (nodeTypes.has(current.type)) return true;

        for (const key of sourceCode.visitorKeys[current.type]) {
          const child = (current as unknown as Record<string, unknown>)[key];

          if (Array.isArray(child)) {
            nodes.push(...child.filter(isNode));
          } else if (isNode(child)) {
            nodes.push(child);
          }
        }
      }

      return false;
    };

    const hasNestedConditional = (node: TSESTree.ConditionalExpression) =>
      node.alternate.type === AST_NODE_TYPES.ConditionalExpression ||
      node.consequent.type === AST_NODE_TYPES.ConditionalExpression;

    const canFlatten = (node: TSESTree.ConditionalExpression): boolean => {
      if (node.consequent.type === AST_NODE_TYPES.ConditionalExpression) {
        return false;
      }

      return (
        node.alternate.type !== AST_NODE_TYPES.ConditionalExpression ||
        canFlatten(node.alternate)
      );
    };

    const statementLines = (node: TSESTree.ConditionalExpression): string[] => {
      const test = sourceCode.getText(node.test);
      const consequent = sourceCode.getText(node.consequent);

      if (node.alternate.type === AST_NODE_TYPES.ConditionalExpression) {
        return [
          `if (${test}) {`,
          `  return ${consequent};`,
          `}`,
          ...statementLines(node.alternate),
        ];
      }

      return [
        `if (${test}) {`,
        `  return ${consequent};`,
        `}`,
        `return ${sourceCode.getText(node.alternate)};`,
      ];
    };

    const iifeText = (node: TSESTree.ConditionalExpression) =>
      `(() => {\n${statementLines(node)
        .map((line) => `  ${line}`)
        .join("\n")}\n})()`;

    return {
      ConditionalExpression(node) {
        if (!hasNestedConditional(node)) return;

        const canFix =
          canFlatten(node) && !containsNodeType(node, prohibitedFixNodes);

        context.report({
          node,
          messageId: "noNestedTernary",
          fix: canFix
            ? (fixer) => fixer.replaceText(node, iifeText(node))
            : null,
        });
      },
    };
  },
});

export default rule;
