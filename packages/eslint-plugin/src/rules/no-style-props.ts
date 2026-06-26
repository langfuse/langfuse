import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createComponentPropTypeVisitors } from "../react-components.js";
import { createRule } from "../util.js";

const FORBIDDEN_PROP_NAMES = new Set(["className", "style"]);

function getPropertyName(
  key: TSESTree.PropertyName | TSESTree.PrivateIdentifier,
): string | null {
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === "string") {
    return key.value;
  }
  return null;
}

const rule = createRule({
  name: "no-style-props",
  meta: {
    type: "problem",
    docs: {
      description: "Disallow className and style props.",
    },
    schema: [],
    messages: {
      unexpectedProp:
        "Components must not expose {{propName}} props. Add explicit variant props instead.",
    },
  },
  defaultOptions: [],
  create(context) {
    function reportForbiddenProp(
      node: TSESTree.Node,
      propName: string | null,
    ): void {
      if (!propName || !FORBIDDEN_PROP_NAMES.has(propName)) return;
      context.report({
        node,
        messageId: "unexpectedProp",
        data: { propName },
      });
    }

    return createComponentPropTypeVisitors({
      onPropProperty(node) {
        reportForbiddenProp(node.key, getPropertyName(node.key));
      },
      onDestructuredProp(node) {
        reportForbiddenProp(node.key, getPropertyName(node.key));
      },
    });
  },
});

export default rule;
