import { basename } from "node:path";
import { AST_NODE_TYPES as N, type TSESTree } from "@typescript-eslint/utils";
import { createRule } from "../util.js";

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;

type PendingExport = { local: string; name: string | null };

function unwrap(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  // Oxlint keeps parentheses. typescript-eslint removes them before the rule runs.
  while ((current.type as string) === "ParenthesizedExpression") {
    current = (current as { expression: TSESTree.Node }).expression;
  }
  return current;
}

function isFunctionValue(
  node: TSESTree.Expression | null | undefined,
): boolean {
  if (!node) return false;
  const value = unwrap(node);
  return (
    value.type === N.ArrowFunctionExpression ||
    value.type === N.FunctionExpression
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

function exportedFunctionName(
  local: string,
  exported: TSESTree.Identifier | TSESTree.StringLiteral,
): string | null {
  const exportedName = moduleName(exported);
  if (exportedName === "default") return local;
  return exportedName;
}

type Counts = {
  functions: Set<string>;
  declaredExports: Set<string>;
  pending: PendingExport[];
  functionCount: number;
  otherCount: number;
  soleName: string | null;
};

function noteFunction(counts: Counts, name: string | null) {
  counts.functionCount += 1;
  counts.soleName = name;
}

function noteDeclaredFunction(counts: Counts, name: string) {
  if (counts.declaredExports.has(name)) return;
  counts.declaredExports.add(name);
  noteFunction(counts, name);
}

function noteOther(counts: Counts) {
  counts.otherCount += 1;
}

function declarationName(declaration: {
  id: TSESTree.Identifier | null;
}): string | null {
  if (declaration.id === null) return null;
  return declaration.id.name;
}

function rememberFunction(counts: Counts, name: string | null) {
  if (name === null) return;
  counts.functions.add(name);
}

function rememberDeclarator(
  counts: Counts,
  declarator: TSESTree.VariableDeclarator,
) {
  const name = bindingName(declarator.id);
  if (name !== null && isFunctionValue(declarator.init)) {
    counts.functions.add(name);
  }
}

function noteDefault(
  counts: Counts,
  declaration: TSESTree.ExportDefaultDeclaration["declaration"],
) {
  const value = unwrap(declaration);
  if (
    value.type === N.TSInterfaceDeclaration ||
    value.type === N.TSTypeAliasDeclaration
  ) {
    return;
  }
  if (value.type === N.FunctionDeclaration) {
    const name = declarationName(value);
    rememberFunction(counts, name);
    noteFunction(counts, name);
    return;
  }
  if (value.type === N.FunctionExpression) {
    const name = declarationName(value);
    noteFunction(counts, name);
    return;
  }
  if (value.type === N.ArrowFunctionExpression) {
    noteFunction(counts, null);
    return;
  }
  if (value.type === N.Identifier) {
    counts.pending.push({ local: value.name, name: value.name });
    return;
  }
  noteOther(counts);
}

function noteSpecifier(counts: Counts, specifier: TSESTree.ExportSpecifier) {
  if (specifier.exportKind === "type") return;
  // A string-literal local is only legal on `export { "a" as b } from`.
  const local = (specifier.local as TSESTree.Identifier).name;
  counts.pending.push({
    local,
    name: exportedFunctionName(local, specifier.exported),
  });
}

function noteNamed(counts: Counts, statement: TSESTree.ExportNamedDeclaration) {
  const declaration = statement.declaration;
  if (
    declaration !== null &&
    (declaration.type === N.FunctionDeclaration ||
      declaration.type === N.TSDeclareFunction)
  ) {
    // `export function` and `export declare function` always name the function.
    const name = declaration.id!.name;
    rememberFunction(counts, name);
    noteDeclaredFunction(counts, name);
    return;
  }
  if (declaration !== null && declaration.type === N.TSEnumDeclaration) {
    noteOther(counts);
    return;
  }
  if (statement.exportKind === "type") return;
  if (declaration !== null) {
    if (declaration.type === N.VariableDeclaration) {
      for (const declarator of declaration.declarations) {
        rememberDeclarator(counts, declarator);
        const name = bindingName(declarator.id);
        if (name !== null && isFunctionValue(declarator.init)) {
          noteFunction(counts, name);
        } else {
          noteOther(counts);
        }
      }
      return;
    }
    noteOther(counts);
    return;
  }
  if (statement.source !== null) {
    let hasValue = false;
    for (const specifier of statement.specifiers) {
      if (specifier.exportKind !== "type") hasValue = true;
    }
    if (hasValue || statement.specifiers.length === 0) noteOther(counts);
    return;
  }
  for (const specifier of statement.specifiers)
    noteSpecifier(counts, specifier);
}

function noteStatement(counts: Counts, statement: TSESTree.ProgramStatement) {
  if (statement.type === N.FunctionDeclaration) {
    rememberFunction(counts, declarationName(statement));
    return;
  }
  if (statement.type === N.VariableDeclaration) {
    for (const declarator of statement.declarations) {
      rememberDeclarator(counts, declarator);
    }
    return;
  }
  if (statement.type === N.ExportDefaultDeclaration) {
    noteDefault(counts, statement.declaration);
    return;
  }
  if (statement.type === N.ExportAllDeclaration) {
    if (statement.exportKind !== "type") noteOther(counts);
    return;
  }
  if (statement.type === N.ExportNamedDeclaration) {
    noteNamed(counts, statement);
  }
}

function resolvePending(counts: Counts) {
  for (const pending of counts.pending) {
    if (counts.functions.has(pending.local)) noteFunction(counts, pending.name);
    else noteOther(counts);
  }
}

function reportedCount(functionCount: number, otherCount: number): number {
  if (functionCount === 0) return 0;
  if (otherCount === 0) return functionCount;
  return functionCount + otherCount;
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
    const expected = basename(context.filename).replace(SOURCE_EXTENSION, "");

    return {
      Program(program) {
        const counts: Counts = {
          functions: new Set(),
          declaredExports: new Set(),
          pending: [],
          functionCount: 0,
          otherCount: 0,
          soleName: null,
        };
        for (const statement of program.body) noteStatement(counts, statement);
        resolvePending(counts);

        if (counts.functionCount !== 1 || counts.otherCount !== 0) {
          context.report({
            node: program,
            messageId: "count",
            data: {
              count: String(
                reportedCount(counts.functionCount, counts.otherCount),
              ),
            },
          });
          return;
        }
        if (counts.soleName === expected) return;
        context.report({
          node: program,
          messageId: "filename",
          data: { name: expected },
        });
      },
    };
  },
});
