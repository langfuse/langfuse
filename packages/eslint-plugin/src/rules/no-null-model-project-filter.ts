import { type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

const modelsTable = /\bmodels\b/i;
const projectIdIsNull = /\bproject_id\s+IS\s+NULL\b/i;

/** rule flags model queries that treat a null project as "Langfuse-managed" instead of using the scope column */
const rule = createRule<[], "prisma" | "sql">({
  name: "no-null-model-project-filter",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow `projectId: null` and `project_id IS NULL` on models; filter on scope instead.",
    },
    messages: {
      prisma:
        'Do not match models on `projectId: null`; use `scope: "LANGFUSE"` for Langfuse-managed models.',
      sql: "Do not match models on `project_id IS NULL`; use `scope = 'LANGFUSE'` for Langfuse-managed models.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      CallExpression(node) {
        if (!isModelDelegateCall(node.callee)) return;
        for (const property of nullProjectIdProperties(node.arguments)) {
          context.report({ node: property, messageId: "prisma" });
        }
      },
      TemplateLiteral(node) {
        const text = node.quasis.map((quasi) => quasi.value.raw).join(" ");
        if (projectIdIsNull.test(text) && modelsTable.test(text)) {
          context.report({ node, messageId: "sql" });
        }
      },
    };
  },
});

export default rule;

/** isModelDelegateCall matches `<client>.model.<method>(...)` */
function isModelDelegateCall(callee: TSESTree.Expression): boolean {
  if (callee.type !== "MemberExpression") return false;
  const delegate = callee.object;
  return (
    delegate.type === "MemberExpression" &&
    !delegate.computed &&
    delegate.property.type === "Identifier" &&
    delegate.property.name === "model"
  );
}

/** nullProjectIdProperties finds `projectId: null` anywhere inside object and array literals */
function nullProjectIdProperties(nodes: TSESTree.Node[]): TSESTree.Property[] {
  return nodes.flatMap((node): TSESTree.Property[] => {
    if (node.type === "ArrayExpression") {
      return nullProjectIdProperties(
        node.elements.filter((element) => element !== null),
      );
    }
    if (node.type !== "ObjectExpression") return [];
    return node.properties.flatMap((property) => {
      if (property.type !== "Property") return [];
      if (isProjectIdKey(property) && isNullLiteral(property.value)) {
        return [property];
      }
      return nullProjectIdProperties([property.value]);
    });
  });
}

function isProjectIdKey(property: TSESTree.Property): boolean {
  const { key } = property;
  if (key.type === "Identifier")
    return !property.computed && key.name === "projectId";
  return key.type === "Literal" && key.value === "projectId";
}

function isNullLiteral(node: TSESTree.Node): boolean {
  return node.type === "Literal" && node.value === null;
}
