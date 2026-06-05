const message =
  "Vitest in-source testing should only be used while developing, not in committed code.";

const rule = {
  meta: {
    type: "suggestion",
    docs: {
      description: message,
    },
    messages: {
      unexpected: message,
    },
    schema: [],
  },
  create(context) {
    return {
      'MemberExpression[computed=false][property.name="vitest"][object.type="MetaProperty"][object.meta.name="import"][object.property.name="meta"]'(
        node,
      ) {
        context.report({ node, messageId: "unexpected" });
      },
    };
  },
};

export default rule;
