import { createRule } from "../util.js";

export default createRule({
  name: "no-internal-barrel-files",
  meta: {
    type: "problem",
    docs: {
      description: "Use direct imports instead of internal re-export barrels.",
    },
    messages: {
      unexpected:
        "Internal barrel files expand dependency graphs. Import from the defining files instead; only package and framework entry points may be barrels.",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(node) {
        let hasExports = false;
        for (const statement of node.body) {
          if (statement.type === "ExportAllDeclaration") {
            hasExports = true;
            continue;
          }
          if (statement.type === "ExportNamedDeclaration") {
            if (statement.declaration) return;
            if (statement.specifiers.length > 0) hasExports = true;
            continue;
          }
          if (statement.type === "ExportDefaultDeclaration") {
            if (statement.declaration.type !== "Identifier") return;
            hasExports = true;
            continue;
          }
          if (statement.type === "ImportDeclaration") {
            if (statement.specifiers.length === 0) return;
            continue;
          }
          if (
            statement.type === "ExpressionStatement" &&
            typeof statement.directive === "string"
          ) {
            continue;
          }
          return;
        }

        if (hasExports) context.report({ node, messageId: "unexpected" });
      },
    };
  },
});
