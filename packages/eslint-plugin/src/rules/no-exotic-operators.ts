import { createRule } from "../util.js";

const prohibitedAssignmentOperators = new Set([
  "&&=",
  "||=",
  "??=",
  "&=",
  "|=",
  "^=",
  "<<=",
  ">>=",
  ">>>=",
  "**=",
]);

const prohibitedBinaryOperators = new Set(["&", "|", "^", "<<", ">>", ">>>"]);

const rule = createRule<[], "unexpected">({
  name: "no-exotic-operators",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Disallow logical assignment, bitwise, exponentiation assignment, and comma operators.",
    },
    messages: {
      unexpected:
        "Avoid the {{operator}} operator; use explicit syntax instead.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      AssignmentExpression(node) {
        if (!prohibitedAssignmentOperators.has(node.operator)) return;

        context.report({
          node,
          messageId: "unexpected",
          data: { operator: node.operator },
        });
      },
      BinaryExpression(node) {
        if (!prohibitedBinaryOperators.has(node.operator)) return;

        context.report({
          node,
          messageId: "unexpected",
          data: { operator: node.operator },
        });
      },
      SequenceExpression(node) {
        context.report({
          node,
          messageId: "unexpected",
          data: { operator: "comma" },
        });
      },
      UnaryExpression(node) {
        if (node.operator !== "~") return;

        context.report({
          node,
          messageId: "unexpected",
          data: { operator: node.operator },
        });
      },
    };
  },
});

export default rule;
