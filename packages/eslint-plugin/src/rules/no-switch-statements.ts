import { createRule } from "../util.js";

const rule = createRule({
  name: "no-switch-statements",
  meta: {
    type: "suggestion",
    docs: {
      description: "Disallow switch statements.",
    },
    messages: {
      unexpected:
        "Use if statements or lookup tables instead of switch statements.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      SwitchStatement(node) {
        context.report({ node, messageId: "unexpected" });
      },
    };
  },
});

export default rule;
