import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util.js";
import { getStaticPropertyName, isStoryObject } from "../storybook.js";

const TEST_STORY_PREFIX = "(Test)";

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
          (property) =>
            !property.computed && getStaticPropertyName(property) === "play",
        );
        if (!playProperty) return;

        const nameProperty = properties.find(
          (property) =>
            !property.computed && getStaticPropertyName(property) === "name",
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
