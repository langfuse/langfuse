import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util.js";

const TEST_STORY_PREFIX = "(Test)";

function getPropertyName(property: TSESTree.Property): string | null {
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

function isStoryObject(node: TSESTree.ObjectExpression): boolean {
  const parent = node.parent;

  if (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === node &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    !parent.callee.computed &&
    parent.callee.property.type === AST_NODE_TYPES.Identifier &&
    parent.callee.property.name === "story"
  ) {
    return true;
  }

  return (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === node &&
    parent.parent.parent.type === AST_NODE_TYPES.ExportNamedDeclaration
  );
}

const rule = createRule({
  name: "storybook-play-requires-test-name",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require stories with play functions to have names prefixed with (Test).",
    },
    schema: [],
    messages: {
      testNameRequired:
        'Stories with play functions must set a display name prefixed with "(Test)".',
    },
  },
  defaultOptions: [],
  create(context) {
    return {
      ObjectExpression(node) {
        if (!isStoryObject(node)) return;

        const properties = node.properties.filter(
          (property): property is TSESTree.Property =>
            property.type === AST_NODE_TYPES.Property,
        );
        const playProperty = properties.find(
          (property) => getPropertyName(property) === "play",
        );
        if (!playProperty) return;

        const nameProperty = properties.find(
          (property) => getPropertyName(property) === "name",
        );
        const name =
          nameProperty?.value.type === AST_NODE_TYPES.Literal &&
          typeof nameProperty.value.value === "string"
            ? nameProperty.value.value
            : null;

        if (!name?.startsWith(TEST_STORY_PREFIX)) {
          context.report({
            node: playProperty.key,
            messageId: "testNameRequired",
          });
        }
      },
    };
  },
});

export default rule;
