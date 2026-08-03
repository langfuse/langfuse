import { createRule } from "../util.js";

const rule = createRule({
  name: "no-in-source-vitest",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Vitest in-source testing should only be used while developing, not in committed code.",
    },
    messages: {
      unexpected:
        "Vitest in-source testing should only be used while developing, not in committed code.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      'MemberExpression[computed=false][property.name="vitest"][object.type="MetaProperty"][object.meta.name="import"][object.property.name="meta"]'(
        node,
      ) {
        context.report({ node, messageId: "unexpected" });
      },
    };
  },
});

export default rule;
