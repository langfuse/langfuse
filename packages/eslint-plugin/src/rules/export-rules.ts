import { basename, dirname } from "node:path";
import { AST_NODE_TYPES as N, type TSESTree } from "@typescript-eslint/utils";
import {
  isComponentWrapperCall,
  visitFunctionReturnExpressions,
} from "../react-components.js";
import { createRule } from "../util.js";

const SOURCE_EXTENSION = /\.(?:[cm]?[jt]sx?)$/;
const KINDS = [
  "type",
  "reexport",
  "hook",
  "component",
  "function",
  "class",
  "enum",
  "variable",
] as const;
const HOOK_NAME = /^use[A-Z]/;

type Kind = (typeof KINDS)[number];

type Entry = {
  kind: Kind;
  max: number | null;
  name: string[];
  allowDefault: boolean;
};

type SeenExport = {
  kind: Kind;
  name: string | null;
  isDefault: boolean;
  mutable: boolean;
};

const KIND_SCHEMA = { type: "string" as const, enum: [...KINDS] };

function unwrap(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (
    (current.type as string) === "ParenthesizedExpression" ||
    current.type === N.TSAsExpression ||
    current.type === N.TSSatisfiesExpression ||
    current.type === N.TSNonNullExpression ||
    current.type === N.TSTypeAssertion
  ) {
    current = (current as { expression: TSESTree.Node }).expression;
  }
  return current;
}

function isKind(value: string): value is Kind {
  return (KINDS as readonly string[]).includes(value);
}

function compileNamePattern(pattern: string): RegExp {
  // Lint config, not request input. Compiled once when the rule loads.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  return new RegExp(pattern);
}

function readAllow(option: unknown): {
  entries: Entry[];
  patterns: Map<string, RegExp>;
} {
  if (option === null || typeof option !== "object" || Array.isArray(option)) {
    throw new Error("export-rules options must be an object with allow");
  }
  const allow = (option as { allow?: unknown }).allow;
  if (!Array.isArray(allow)) {
    throw new Error("export-rules allow must be an array");
  }
  const compiled = new Map<string, RegExp>();
  const entries = allow.map((entry) => {
    if (typeof entry === "string") {
      if (!isKind(entry)) throw new Error(`Unknown export kind "${entry}"`);
      return { kind: entry, max: null, name: [], allowDefault: false };
    }
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("export-rules allow entries must be a kind or an object");
    }
    const record = entry as Record<string, unknown>;
    const keys = Object.keys(record);
    if (keys.length === 0) {
      throw new Error("export-rules allow objects must not be empty");
    }
    for (const key of keys) {
      if (
        key !== "kind" &&
        key !== "max" &&
        key !== "name" &&
        key !== "default"
      ) {
        throw new Error(`Unknown export-rules option "${key}"`);
      }
    }
    if (typeof record.kind !== "string" || !isKind(record.kind)) {
      throw new Error("export-rules allow objects need a known kind");
    }
    if (
      record.max !== undefined &&
      (typeof record.max !== "number" ||
        !Number.isInteger(record.max) ||
        record.max < 0)
    ) {
      throw new Error("export-rules max must be a non-negative integer");
    }
    if (
      record.name !== undefined &&
      (!Array.isArray(record.name) ||
        record.name.length === 0 ||
        record.name.some((item) => typeof item !== "string" || item === ""))
    ) {
      throw new Error("export-rules name must be a non-empty string array");
    }
    if (record.default !== undefined && typeof record.default !== "boolean") {
      throw new Error("export-rules default must be a boolean");
    }
    const patterns = (record.name as string[] | undefined) ?? [];
    for (const pattern of patterns) {
      if (pattern === "matchesFilename" || pattern === "matchesDirname")
        continue;
      try {
        compiled.set(pattern, compileNamePattern(pattern));
      } catch {
        throw new Error(`Invalid export-rules name pattern "${pattern}"`);
      }
    }
    return {
      kind: record.kind,
      max: record.max === undefined ? null : record.max,
      name: patterns,
      allowDefault: record.default === true,
    };
  });
  return { entries, patterns: compiled };
}

function toCamel(base: string): string {
  return base.replace(/[-_]+([A-Za-z0-9])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function fileBase(filename: string): string {
  return toCamel(basename(filename).replace(SOURCE_EXTENSION, ""));
}

function dirBase(filename: string): string {
  return toCamel(basename(dirname(filename)));
}

function isFunctionNode(node: TSESTree.Node): boolean {
  const value = unwrap(node);
  return (
    value.type === N.ArrowFunctionExpression ||
    value.type === N.FunctionExpression ||
    value.type === N.FunctionDeclaration ||
    value.type === N.TSDeclareFunction
  );
}

function functionName(node: TSESTree.Node): string | null {
  const value = unwrap(node);
  if (
    value.type === N.FunctionDeclaration ||
    value.type === N.FunctionExpression ||
    value.type === N.TSDeclareFunction ||
    value.type === N.ClassDeclaration ||
    value.type === N.ClassExpression
  ) {
    return value.id === null ? null : value.id.name;
  }
  return null;
}

function hasJsx(node: TSESTree.Node): boolean {
  const value = unwrap(node);
  if (value.type === N.JSXElement || value.type === N.JSXFragment) return true;
  if (value.type === N.ConditionalExpression)
    return hasJsx(value.consequent) || hasJsx(value.alternate);
  if (value.type === N.LogicalExpression)
    return hasJsx(value.left) || hasJsx(value.right);
  if (value.type === N.CallExpression) {
    const callee = value.callee;
    if (callee.type === N.Identifier && callee.name === "createElement")
      return true;
    if (
      callee.type === N.MemberExpression &&
      callee.object.type === N.Identifier &&
      callee.object.name === "React" &&
      callee.property.type === N.Identifier &&
      callee.property.name === "createElement"
    )
      return true;
  }
  return false;
}

function isObjectAssign(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    callee.type === N.MemberExpression &&
    callee.object.type === N.Identifier &&
    callee.object.name === "Object" &&
    callee.property.type === N.Identifier &&
    callee.property.name === "assign"
  );
}

function extendsComponent(
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): boolean {
  const base = node.superClass;
  if (!base) return false;
  if (base.type === N.Identifier) return /^(Pure)?Component$/.test(base.name);
  return (
    base.type === N.MemberExpression &&
    base.property.type === N.Identifier &&
    /^(Pure)?Component$/.test(base.property.name)
  );
}

function annotationIsComponent(
  annotation: TSESTree.TypeNode | undefined,
): boolean {
  if (!annotation) return false;
  if (annotation.type === N.TSTypeReference) {
    const name = annotation.typeName;
    if (name.type === N.Identifier)
      return /^(?:FC|FunctionComponent|ComponentType)$/.test(name.name);
    if (
      name.type === N.TSQualifiedName &&
      /^(?:FC|FunctionComponent|ComponentType)$/.test(name.right.name)
    )
      return true;
  }
  return false;
}

function isComponentValue(
  node: TSESTree.Node,
  name: string | null,
  bindings: Map<string, TSESTree.Node>,
  seen: Set<TSESTree.Node>,
): boolean {
  if (seen.has(node)) return false;
  seen.add(node);
  const value = unwrap(node);
  if (value.type === N.Identifier) {
    const bound = bindings.get(value.name);
    return bound ? isComponentValue(bound, name, bindings, seen) : false;
  }
  if (value.type === N.VariableDeclarator) {
    if (
      value.id.type === N.Identifier &&
      annotationIsComponent(value.id.typeAnnotation?.typeAnnotation)
    )
      return true;
    return value.init
      ? isComponentValue(value.init, name, bindings, seen)
      : false;
  }
  if (value.type === N.CallExpression) {
    if (isComponentWrapperCall(value)) return true;
    if (isObjectAssign(value)) {
      const root = value.arguments[0];
      return root ? isComponentValue(root, name, bindings, seen) : false;
    }
  }
  if (
    value.type !== N.FunctionDeclaration &&
    value.type !== N.FunctionExpression &&
    value.type !== N.ArrowFunctionExpression
  )
    return false;
  if (name !== null && /^[A-Z]/.test(name)) {
    let renders: boolean | null = null;
    visitFunctionReturnExpressions(value, (returned) => {
      const nullLiteral =
        returned.type === N.Literal && returned.value === null;
      const jsx = hasJsx(returned);
      if (nullLiteral || jsx) renders = true;
      else if (renders === null) renders = false;
    });
    if (renders === true) return true;
  }
  let jsx = false;
  visitFunctionReturnExpressions(value, (returned) => {
    jsx ||= hasJsx(returned);
  });
  return jsx;
}

function bindingName(node: TSESTree.BindingName): string | null {
  if (node.type === N.Identifier) return node.name;
  return null;
}

function exportedName(
  local: string,
  exported: TSESTree.Identifier | TSESTree.StringLiteral,
): { name: string | null; isDefault: boolean } {
  if (exported.type !== N.Identifier) return { name: null, isDefault: false };
  if (exported.name === "default") return { name: local, isDefault: true };
  return { name: exported.name, isDefault: false };
}

export default createRule({
  name: "export-rules",
  meta: {
    type: "problem",
    docs: { description: "Restrict which exports a file may have." },
    messages: {
      kindNotAllowed: 'Export of kind "{{kind}}" is not allowed',
      maxExceeded: 'Too many "{{kind}}" exports (found {{count}}, max {{max}})',
      mutableExport: "Exported let or var is not allowed",
      filenameMismatch: 'Export name must match the file name "{{expected}}"',
      dirnameMismatch:
        'Export name must match the directory name "{{expected}}"',
      patternMismatch: "Export name must match {{pattern}}",
      defaultNotAllowed: "Default {{kind}} export is not allowed",
    },
    schema: [
      {
        type: "object",
        additionalProperties: false,
        required: ["allow"],
        properties: {
          allow: {
            type: "array",
            items: {
              oneOf: [
                KIND_SCHEMA,
                {
                  type: "object",
                  additionalProperties: false,
                  required: ["kind"],
                  properties: {
                    kind: KIND_SCHEMA,
                    max: { type: "integer", minimum: 0 },
                    name: {
                      type: "array",
                      minItems: 1,
                      items: { type: "string", minLength: 1 },
                    },
                    default: { type: "boolean" },
                  },
                },
              ],
            },
          },
        },
      },
    ],
  },
  defaultOptions: [{ allow: [] as unknown[] }],
  create(context) {
    const { entries, patterns } = readAllow(context.options[0]);
    const byKind = new Map<Kind, Entry>();
    for (const entry of entries) {
      if (!byKind.has(entry.kind)) byKind.set(entry.kind, entry);
    }
    const detectComponents = byKind.has("component");
    const bindings = new Map<string, TSESTree.Node>();
    const mutableNames = new Set<string>();
    const kindOf = new Map<string, Kind>();
    const seenCallables = new Map<string, SeenExport>();
    const exports: SeenExport[] = [];
    const pending: {
      local: string;
      name: string | null;
      isDefault: boolean;
    }[] = [];

    function remember(name: string | null, node: TSESTree.Node) {
      if (name !== null) bindings.set(name, node);
    }

    // A type and a value may share a name. `export { Name }` still exports
    // the value, so a type annotation must not replace a value kind.
    function noteTypeName(name: string) {
      const existing = kindOf.get(name);
      if (existing !== undefined && existing !== "type") return;
      kindOf.set(name, "type");
    }

    function classify(node: TSESTree.Node, name: string | null): Kind {
      const value = unwrap(node);
      if (value.type === N.TSInterfaceDeclaration) return "type";
      if (
        value.type === N.ClassDeclaration ||
        value.type === N.ClassExpression
      ) {
        if (detectComponents && extendsComponent(value)) return "component";
        return "class";
      }
      if (value.type === N.VariableDeclarator) {
        if (
          detectComponents &&
          value.id.type === N.Identifier &&
          annotationIsComponent(value.id.typeAnnotation?.typeAnnotation)
        )
          return "component";
        return value.init ? classify(value.init, name) : "variable";
      }
      if (isFunctionNode(value)) {
        const called = name ?? functionName(value);
        if (called !== null && HOOK_NAME.test(called)) return "hook";
        if (
          detectComponents &&
          isComponentValue(value, called, bindings, new Set())
        )
          return "component";
        return "function";
      }
      if (value.type === N.CallExpression) {
        if (
          detectComponents &&
          isComponentValue(value, name, bindings, new Set())
        )
          return "component";
      }
      return "variable";
    }

    function push(exporting: SeenExport) {
      if (
        (exporting.kind === "function" ||
          exporting.kind === "hook" ||
          exporting.kind === "component") &&
        exporting.name !== null &&
        !exporting.isDefault
      ) {
        const previous = seenCallables.get(exporting.name);
        if (previous) {
          // Overload signatures have no body, so they classify as function
          // until the implementation shows a hook or component.
          if (previous.kind === "function" && exporting.kind !== "function")
            previous.kind = exporting.kind;
          return;
        }
        seenCallables.set(exporting.name, exporting);
      }
      exports.push(exporting);
    }

    function noteValue(
      node: TSESTree.Node,
      name: string | null,
      isDefault: boolean,
      mutable: boolean,
    ) {
      push({ kind: classify(node, name), name, isDefault, mutable });
    }

    return {
      Program(program) {
        for (const statement of program.body) {
          if (
            statement.type === N.FunctionDeclaration ||
            statement.type === N.TSDeclareFunction
          ) {
            remember(statement.id!.name, statement);
            continue;
          }
          if (statement.type === N.ClassDeclaration) {
            remember(statement.id!.name, statement);
            continue;
          }
          if (statement.type === N.VariableDeclaration) {
            const mutable =
              statement.kind === "let" || statement.kind === "var";
            for (const declarator of statement.declarations) {
              const name = bindingName(declarator.id);
              remember(name, declarator);
              if (mutable && name !== null) mutableNames.add(name);
            }
            continue;
          }
          if (
            statement.type === N.TSTypeAliasDeclaration ||
            statement.type === N.TSInterfaceDeclaration
          ) {
            noteTypeName(statement.id.name);
            continue;
          }
          if (statement.type === N.TSEnumDeclaration) {
            kindOf.set(statement.id.name, "enum");
            continue;
          }
          if (statement.type === N.ImportDeclaration) {
            const importedType = statement.importKind === "type";
            for (const specifier of statement.specifiers) {
              const typeOnly =
                importedType ||
                (specifier.type === N.ImportSpecifier &&
                  specifier.importKind === "type");
              if (typeOnly) noteTypeName(specifier.local.name);
              else kindOf.set(specifier.local.name, "reexport");
            }
            continue;
          }
          if (statement.type === N.ExportAllDeclaration) {
            push({
              kind: statement.exportKind === "type" ? "type" : "reexport",
              name: null,
              isDefault: false,
              mutable: false,
            });
            continue;
          }
          if (statement.type === N.ExportDefaultDeclaration) {
            const value = unwrap(statement.declaration);
            if (value.type === N.Identifier) {
              pending.push({
                local: value.name,
                name: value.name,
                isDefault: true,
              });
              continue;
            }
            const name = functionName(value);
            noteValue(value, name, true, false);
            if (name !== null) remember(name, value);
            continue;
          }
          if (statement.type !== N.ExportNamedDeclaration) continue;
          const declaration = statement.declaration;
          if (
            declaration !== null &&
            declaration.type === N.TSEnumDeclaration
          ) {
            kindOf.set(declaration.id.name, "enum");
            push({
              kind: "enum",
              name: declaration.id.name,
              isDefault: false,
              mutable: false,
            });
            continue;
          }
          if (statement.exportKind === "type") {
            const named = statement.declaration;
            if (
              named !== null &&
              (named.type === N.TSTypeAliasDeclaration ||
                named.type === N.TSInterfaceDeclaration)
            )
              noteTypeName(named.id.name);
            push({
              kind: "type",
              name: null,
              isDefault: false,
              mutable: false,
            });
            continue;
          }
          if (declaration !== null) {
            if (
              declaration.type === N.FunctionDeclaration ||
              declaration.type === N.TSDeclareFunction
            ) {
              const name = declaration.id!.name;
              remember(name, declaration);
              noteValue(declaration, name, false, false);
              continue;
            }
            if (declaration.type === N.ClassDeclaration) {
              remember(declaration.id!.name, declaration);
              noteValue(declaration, declaration.id!.name, false, false);
              continue;
            }
            if (declaration.type !== N.VariableDeclaration) {
              noteValue(declaration, null, false, false);
              continue;
            }
            const mutable =
              declaration.kind === "let" || declaration.kind === "var";
            for (const declarator of declaration.declarations) {
              const name = bindingName(declarator.id);
              remember(name, declarator);
              noteValue(declarator, name, false, mutable);
            }
            continue;
          }
          if (statement.source !== null) {
            for (const specifier of statement.specifiers) {
              if (specifier.exportKind === "type") {
                push({
                  kind: "type",
                  name: null,
                  isDefault: false,
                  mutable: false,
                });
                continue;
              }
              const local =
                specifier.local.type === N.Identifier
                  ? specifier.local.name
                  : null;
              const exported =
                local === null
                  ? { name: null, isDefault: false }
                  : exportedName(local, specifier.exported);
              push({
                kind: "reexport",
                name: exported.name,
                isDefault: exported.isDefault,
                mutable: false,
              });
            }
            continue;
          }
          for (const specifier of statement.specifiers) {
            if (specifier.exportKind === "type") {
              push({
                kind: "type",
                name: null,
                isDefault: false,
                mutable: false,
              });
              continue;
            }
            const exported = exportedName(
              specifier.local.name,
              specifier.exported,
            );
            pending.push({
              local: specifier.local.name,
              name: exported.name,
              isDefault: exported.isDefault,
            });
          }
        }
        for (const item of pending) {
          const mutable = mutableNames.has(item.local);
          const bound = bindings.get(item.local);
          if (bound) {
            noteValue(bound, item.name, item.isDefault, mutable);
            continue;
          }
          const known = kindOf.get(item.local);
          if (known !== undefined) {
            push({
              kind: known,
              name: item.name,
              isDefault: item.isDefault,
              mutable,
            });
            continue;
          }
          push({
            kind: "variable",
            name: item.name,
            isDefault: item.isDefault,
            mutable,
          });
        }

        const counts = new Map<Kind, number>();
        for (const item of exports) {
          if (item.mutable) {
            context.report({ node: program, messageId: "mutableExport" });
            continue;
          }
          const entry = byKind.get(item.kind);
          if (!entry) {
            context.report({
              node: program,
              messageId: "kindNotAllowed",
              data: { kind: item.kind },
            });
            continue;
          }
          // `export default interface` is a type export, same as `export interface`.
          if (item.isDefault && item.kind !== "type" && !entry.allowDefault) {
            context.report({
              node: program,
              messageId: "defaultNotAllowed",
              data: { kind: item.kind },
            });
            continue;
          }
          counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
        }

        for (const [kind, count] of counts) {
          const entry = byKind.get(kind)!;
          if (entry.max !== null && count > entry.max) {
            context.report({
              node: program,
              messageId: "maxExceeded",
              data: { kind, count: String(count), max: String(entry.max) },
            });
            continue;
          }
          if (entry.name.length === 0) continue;
          for (const item of exports) {
            if (item.kind !== kind || item.mutable) continue;
            if (item.isDefault && !entry.allowDefault) continue;
            checkName(
              context as unknown as Parameters<typeof checkName>[0],
              program,
              item.name,
              entry.name,
              patterns,
            );
          }
        }
      },
    };
  },
});

function checkName(
  context: {
    filename: string;
    report: (descriptor: {
      node: TSESTree.Node;
      messageId: string;
      data?: Record<string, string>;
    }) => void;
  },
  program: TSESTree.Program,
  exportName: string | null,
  restrictions: string[],
  patterns: Map<string, RegExp>,
) {
  let subject = exportName;
  for (const restriction of restrictions) {
    if (restriction === "matchesFilename" || restriction === "matchesDirname")
      continue;
    let matched: RegExpExecArray | null = null;
    if (exportName !== null)
      matched = patterns.get(restriction)!.exec(exportName);
    if (!matched) {
      context.report({
        node: program,
        messageId: "patternMismatch",
        data: { pattern: restriction },
      });
      return;
    }
    if (matched.groups?.base !== undefined) subject = matched.groups.base;
  }
  for (const restriction of restrictions) {
    if (restriction !== "matchesFilename" && restriction !== "matchesDirname")
      continue;
    const expected =
      restriction === "matchesFilename"
        ? fileBase(context.filename)
        : dirBase(context.filename);
    if (subject === expected) continue;
    context.report({
      node: program,
      messageId:
        restriction === "matchesFilename"
          ? "filenameMismatch"
          : "dirnameMismatch",
      data: { expected },
    });
  }
}
