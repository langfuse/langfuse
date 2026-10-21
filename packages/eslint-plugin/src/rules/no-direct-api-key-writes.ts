import { type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

const apiKeyWriteMethods = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "upsert",
]);

/** rule flags Prisma writes that create ApiKey rows outside createApiKey */
const rule = createRule<[], "unexpected">({
  name: "no-direct-api-key-writes",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow creating ApiKey rows with Prisma directly; use createApiKey.",
    },
    messages: {
      unexpected:
        "Do not call apiKey.{{method}} directly; use createApiKey from @langfuse/shared/src/server so the key gets its scope columns and role assignment in one transaction.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        const method = apiKeyWriteMethod(node.callee);
        if (method === undefined) return;

        context.report({ node, messageId: "unexpected", data: { method } });
      },
    };
  },
});

export default rule;

/** apiKeyWriteMethod returns the write method name when callee is `<x>.apiKey.<write method>` */
function apiKeyWriteMethod(callee: TSESTree.Expression): string | undefined {
  const call = unwrapChain(callee);
  if (call.type !== "MemberExpression") return undefined;

  const method = propertyName(call);
  if (method === undefined || !apiKeyWriteMethods.has(method)) return undefined;

  const model = unwrapChain(call.object);
  if (model.type !== "MemberExpression") return undefined;
  if (propertyName(model) !== "apiKey") return undefined;

  return method;
}

/** unwrapChain strips optional-chain and non-null wrappers around an expression */
function unwrapChain(node: TSESTree.Expression): TSESTree.Expression {
  if (node.type === "ChainExpression") return unwrapChain(node.expression);
  if (node.type === "TSNonNullExpression") return unwrapChain(node.expression);
  return node;
}

/** propertyName reads a member's static property name for `a.b` and `a["b"]` */
function propertyName(node: TSESTree.MemberExpression): string | undefined {
  if (!node.computed && node.property.type === "Identifier") {
    return node.property.name;
  }
  if (
    node.computed &&
    node.property.type === "Literal" &&
    typeof node.property.value === "string"
  ) {
    return node.property.value;
  }
  return undefined;
}
