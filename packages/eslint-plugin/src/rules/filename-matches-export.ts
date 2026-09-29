import { basename, extname } from "node:path";
import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createRule } from "../util.js";

function getDeclarationNames(
  declaration: TSESTree.NamedExportDeclarations,
): string[] {
  if (declaration.type === AST_NODE_TYPES.VariableDeclaration) {
    return declaration.declarations.flatMap(({ id }) =>
      id.type === AST_NODE_TYPES.Identifier ? [id.name] : [],
    );
  }

  if (
    declaration.type === AST_NODE_TYPES.FunctionDeclaration ||
    declaration.type === AST_NODE_TYPES.ClassDeclaration ||
    declaration.type === AST_NODE_TYPES.TSEnumDeclaration
  ) {
    // Named export declarations cannot be anonymous.
    return [declaration.id!.name];
  }

  return [];
}

function getDefaultExportName(
  declaration: TSESTree.ExportDefaultDeclaration["declaration"],
) {
  if (declaration.type === AST_NODE_TYPES.Identifier) return declaration.name;

  if (
    declaration.type === AST_NODE_TYPES.FunctionDeclaration ||
    declaration.type === AST_NODE_TYPES.ClassDeclaration
  ) {
    return declaration.id?.name;
  }

  return undefined;
}

const rule = createRule({
  name: "filename-matches-export",
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Require a file to have a runtime export matching its filename.",
    },
    messages: {
      missing:
        'File "{{ filename }}" must export a runtime value named "{{ expected }}".',
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    return {
      Program(node) {
        const filename = basename(context.filename);
        const expected = basename(filename, extname(filename));
        const exportedNames = node.body.flatMap((statement) => {
          if (statement.type === AST_NODE_TYPES.ExportDefaultDeclaration) {
            const name = getDefaultExportName(statement.declaration);
            return name ? [name] : [];
          }

          if (
            statement.type !== AST_NODE_TYPES.ExportNamedDeclaration ||
            statement.exportKind === "type"
          ) {
            return [];
          }

          if (statement.declaration) {
            return getDeclarationNames(statement.declaration);
          }

          return statement.specifiers.flatMap((specifier) => {
            if (specifier.exportKind === "type") return [];
            return specifier.exported.type === AST_NODE_TYPES.Identifier
              ? [specifier.exported.name]
              : [specifier.exported.value];
          });
        });

        if (exportedNames.includes(expected)) return;

        context.report({
          node,
          messageId: "missing",
          data: { expected, filename },
        });
      },
    };
  },
});

export default rule;
