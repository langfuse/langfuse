import { basename } from "node:path";
import { AST_NODE_TYPES as N, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util.js";

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;

type FunctionExport = { kind: "function"; name: string | null };
type ExportRecord = FunctionExport | { kind: "other" };

function isFunctionValue(
  node: TSESTree.Expression | null | undefined,
): boolean {
  if (!node) return false;
  return (
    node.type === N.ArrowFunctionExpression ||
    node.type === N.FunctionExpression
  );
}

function bindingName(node: TSESTree.BindingName): string | null {
  if (node.type === N.Identifier) return node.name;
  return null;
}

function moduleName(
  node: TSESTree.Identifier | TSESTree.StringLiteral,
): string | null {
  if (node.type === N.Identifier) return node.name;
  return null;
}

function functionDeclarationName(
  node: TSESTree.FunctionDeclaration | TSESTree.TSDeclareFunction,
): string | null {
  if (node.id === null) return null;
  return node.id.name;
}

function readDefault(
  declaration: TSESTree.ExportDefaultDeclaration["declaration"],
  functionBindings: Set<string>,
): ExportRecord {
  if (declaration.type === N.FunctionDeclaration) {
    return { kind: "function", name: functionDeclarationName(declaration) };
  }
  if (
    declaration.type === N.FunctionExpression ||
    declaration.type === N.ArrowFunctionExpression
  ) {
    const name =
      declaration.type === N.FunctionExpression && declaration.id !== null
        ? declaration.id.name
        : null;
    return { kind: "function", name };
  }
  if (
    declaration.type === N.Identifier &&
    functionBindings.has(declaration.name)
  ) {
    return { kind: "function", name: declaration.name };
  }
  return { kind: "other" };
}

function isModuleLevel(node: TSESTree.Node): boolean {
  const parent = node.parent;
  if (parent?.type === N.Program) return true;
  if (parent?.type === N.ExportDefaultDeclaration) {
    return parent.parent?.type === N.Program;
  }
  if (parent?.type === N.ExportNamedDeclaration) {
    return parent.parent?.type === N.Program;
  }
  if (parent?.type !== N.VariableDeclaration) return false;
  const owner = parent.parent;
  if (owner?.type === N.Program) return true;
  if (owner?.type === N.ExportNamedDeclaration) {
    return owner.parent?.type === N.Program;
  }
  return false;
}

function exportedFunctionName(
  local: string,
  exported: TSESTree.Identifier | TSESTree.StringLiteral,
): string | null {
  const exportedName = moduleName(exported);
  if (exportedName === "default") return local;
  return exportedName;
}

function readNamed(
  statement: TSESTree.ExportNamedDeclaration,
  functionBindings: Set<string>,
): ExportRecord[] {
  const declaration = statement.declaration;
  if (
    declaration !== null &&
    (declaration.type === N.FunctionDeclaration ||
      declaration.type === N.TSDeclareFunction)
  ) {
    return [{ kind: "function", name: functionDeclarationName(declaration) }];
  }
  if (statement.exportKind === "type") return [{ kind: "other" }];

  if (declaration !== null) {
    if (declaration.type === N.VariableDeclaration) {
      return declaration.declarations.map((declarator) => {
        const name = bindingName(declarator.id);
        if (name !== null && isFunctionValue(declarator.init)) {
          return { kind: "function", name };
        }
        return { kind: "other" };
      });
    }
    return [{ kind: "other" }];
  }

  if (statement.source !== null) return [{ kind: "other" }];
  if (statement.specifiers.length === 0) return [];

  return statement.specifiers.map((specifier) => {
    if (specifier.exportKind === "type") return { kind: "other" };
    // A string-literal local binding is only legal on `export { "a" as b } from`.
    const local = (specifier.local as TSESTree.Identifier).name;
    if (!functionBindings.has(local)) return { kind: "other" };
    return {
      kind: "function",
      name: exportedFunctionName(local, specifier.exported),
    };
  });
}

function addExport(exported: ExportRecord[], record: ExportRecord) {
  if (
    record.kind === "function" &&
    record.name !== null &&
    exported.some(
      (item) => item.kind === "function" && item.name === record.name,
    )
  ) {
    return;
  }
  exported.push(record);
}

function collect(
  statement: TSESTree.ProgramStatement,
  functionBindings: Set<string>,
  exported: ExportRecord[],
) {
  if (statement.type === N.ExportDefaultDeclaration) {
    addExport(exported, readDefault(statement.declaration, functionBindings));
    return;
  }
  if (statement.type === N.ExportAllDeclaration) {
    addExport(exported, { kind: "other" });
    return;
  }
  if (statement.type !== N.ExportNamedDeclaration) return;
  for (const record of readNamed(statement, functionBindings)) {
    addExport(exported, record);
  }
}

function reportedCount(
  exported: ExportRecord[],
  functions: FunctionExport[],
): number {
  if (functions.length === 0) return 0;
  if (functions.length !== exported.length) return exported.length;
  return functions.length;
}

export default createRule({
  name: "single-function-export-matching-filename",
  meta: {
    type: "problem",
    docs: {
      description:
        "Require this file to export exactly one function named after the file.",
    },
    messages: {
      count: "File must export exactly one function (found {{count}})",
      filename: "File name must match its exported function: expected {{name}}",
    },
    schema: [],
  },
  defaultOptions: [],
  create(context) {
    const functionBindings = new Set<string>();

    return {
      FunctionDeclaration(node) {
        if (!isModuleLevel(node)) return;
        if (node.id === null) return;
        functionBindings.add(node.id.name);
      },
      VariableDeclarator(node) {
        if (!isModuleLevel(node)) return;
        const name = bindingName(node.id);
        if (name === null) return;
        if (!isFunctionValue(node.init)) return;
        functionBindings.add(name);
      },
      "Program:exit"(program) {
        const exported: ExportRecord[] = [];
        for (const statement of program.body) {
          collect(statement, functionBindings, exported);
        }

        const functions = exported.filter(
          (item): item is FunctionExport => item.kind === "function",
        );
        if (exported.length !== 1 || functions.length !== 1) {
          context.report({
            node: program,
            messageId: "count",
            data: { count: String(reportedCount(exported, functions)) },
          });
          return;
        }

        const expected = basename(context.filename).replace(
          SOURCE_EXTENSION,
          "",
        );
        if (functions[0].name === expected) return;
        context.report({
          node: program,
          messageId: "filename",
          data: { name: expected },
        });
      },
    };
  },
});
