import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util.js";
import {
  getStaticPropertyName,
  isStorybookPlayFunction,
} from "../storybook.js";

const rule = createRule({
  name: "storybook-play-no-implementation-detail-assertions",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow assertions about implementation details in Storybook play functions.",
    },
    schema: [],
    messages: {
      toHaveClass:
        "Do not use toHaveClass in Storybook play functions. If the assertion only checks styling and the styling does not have consequences on behavior, remove it. CSS classes are implementation details: changing styling or refactoring markup can break this assertion without changing what users experience. Assert observable behavior instead, such as visible content, accessible state, focus, or the result of an interaction.",
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;
        if (callee.type !== AST_NODE_TYPES.MemberExpression) return;

        if (getStaticPropertyName(callee) !== "toHaveClass") return;

        for (
          let ancestor: TSESTree.Node | undefined = node.parent;
          ancestor;
          ancestor = ancestor.parent
        ) {
          if (
            (ancestor.type === AST_NODE_TYPES.ArrowFunctionExpression ||
              ancestor.type === AST_NODE_TYPES.FunctionExpression) &&
            isStorybookPlayFunction(ancestor)
          ) {
            context.report({ node: callee.property, messageId: "toHaveClass" });
            return;
          }
        }
      },
    };
  },
});

export default rule;
