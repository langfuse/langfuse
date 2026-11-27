import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createComponentPropTypeVisitors } from "../react-components.js";
import { createRule } from "../util.js";

type Options = [
  {
    allowedPropNames?: string[];
    exemptRenderCallbacks?: boolean;
  },
];

type TypeDeclaration =
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration;

const RENDER_CALLBACK_NAME = /^render(?:[A-Z]|$)/;

function propertyName(
  key: TSESTree.PropertyName | TSESTree.PrivateIdentifier,
): string | null {
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === "string") {
    return key.value;
  }
  return null;
}

function unwrapType(node: TSESTree.TypeNode): TSESTree.TypeNode {
  let current = node;
  while (
    current.type === AST_NODE_TYPES.TSTypeOperator &&
    current.operator === "readonly"
  ) {
    current = current.typeAnnotation!;
  }
  return current;
}

function referenceName(
  typeName: TSESTree.EntityName,
): { qualifier: string | null; name: string } | null {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return { qualifier: null, name: typeName.name };
  }
  if (
    typeName.type === AST_NODE_TYPES.TSQualifiedName &&
    typeName.left.type === AST_NODE_TYPES.Identifier &&
    typeName.right.type === AST_NODE_TYPES.Identifier
  ) {
    return { qualifier: typeName.left.name, name: typeName.right.name };
  }
  return null;
}

function isForbiddenReference(node: TSESTree.TSTypeReference): boolean {
  const name = referenceName(node.typeName);
  if (!name) return false;
  if (name.name === "ReactNode" || name.name === "ReactElement") {
    return name.qualifier === null || name.qualifier === "React";
  }
  return name.name === "Element" && name.qualifier === "JSX";
}

function isArrayReference(node: TSESTree.TSTypeReference): boolean {
  const name = referenceName(node.typeName);
  return (
    name?.qualifier === null &&
    (name.name === "Array" || name.name === "ReadonlyArray")
  );
}

function isExportedFunction(node: TSESTree.Node): boolean {
  return (
    node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    node.parent?.type === AST_NODE_TYPES.ExportDefaultDeclaration
  );
}

function shouldWalkParameters(name: string | null, exported: boolean): boolean {
  if (exported || name === null) return true;
  return /^[A-Z]/.test(name);
}

function parameterType(
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression,
): TSESTree.TypeNode | null {
  const first = node.params[0];
  if (!first || first.type === AST_NODE_TYPES.TSParameterProperty) return null;
  return first.typeAnnotation?.typeAnnotation ?? null;
}

const rule = createRule<Options, "unexpectedProp">({
  name: "no-node-slot-props",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ReactNode, ReactElement, and JSX.Element props on presentational components. Pass typed data, or children, instead of an arbitrary node slot. Function props named render* may return a node when exemptRenderCallbacks is set.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedPropNames: {
            type: "array",
            items: { type: "string" },
          },
          exemptRenderCallbacks: { type: "boolean" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unexpectedProp:
        "Prop '{{propName}}' is typed as a React node. Pass typed data and render it in the component. 'children' is the composition slot.",
    },
  },
  defaultOptions: [
    { allowedPropNames: ["children"], exemptRenderCallbacks: true },
  ],
  create(
    context,
    [{ allowedPropNames = ["children"], exemptRenderCallbacks = true }],
  ) {
    const allowed = new Set(allowedPropNames);
    const types = new Map<string, TypeDeclaration>();
    const extraRoots: TSESTree.TypeNode[] = [];
    const reported = new Set<TSESTree.Node>();

    function containsForbidden(
      node: TSESTree.TypeNode,
      seen: Set<string>,
    ): boolean {
      const current = unwrapType(node);
      switch (current.type) {
        case AST_NODE_TYPES.TSUnionType:
        case AST_NODE_TYPES.TSIntersectionType:
          return current.types.some((type) => containsForbidden(type, seen));
        case AST_NODE_TYPES.TSArrayType:
          return containsForbidden(current.elementType, seen);
        case AST_NODE_TYPES.TSTupleType:
          return current.elementTypes.some((type) =>
            containsForbidden(type, seen),
          );
        case AST_NODE_TYPES.TSFunctionType:
          return containsForbidden(current.returnType!.typeAnnotation, seen);
        case AST_NODE_TYPES.TSTypeReference: {
          if (isForbiddenReference(current)) return true;
          if (isArrayReference(current)) {
            return (current.typeArguments?.params ?? []).some((type) =>
              containsForbidden(type, seen),
            );
          }
          const name = referenceName(current.typeName)?.name ?? null;
          if (!name || seen.has(name)) return false;
          const declaration = types.get(name);
          if (
            !declaration ||
            declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration
          ) {
            return false;
          }
          seen.add(name);
          return containsForbidden(declaration.typeAnnotation, seen);
        }
        default:
          return false;
      }
    }

    function isFunctionType(
      node: TSESTree.TypeNode,
      seen: Set<string>,
    ): boolean {
      const current = unwrapType(node);
      if (current.type === AST_NODE_TYPES.TSFunctionType) return true;
      if (current.type !== AST_NODE_TYPES.TSTypeReference) return false;
      const name = referenceName(current.typeName)?.name ?? null;
      if (!name || seen.has(name)) return false;
      const declaration = types.get(name);
      if (
        !declaration ||
        declaration.type !== AST_NODE_TYPES.TSTypeAliasDeclaration
      ) {
        return false;
      }
      seen.add(name);
      return isFunctionType(declaration.typeAnnotation, seen);
    }

    function visitTypeName(
      typeName: TSESTree.EntityName,
      seen: Set<string>,
      typeArguments?: TSESTree.TSTypeParameterInstantiation,
    ): void {
      const reference = {
        type: AST_NODE_TYPES.TSTypeReference,
        typeName,
        typeArguments,
      } as TSESTree.TSTypeReference;
      if (isForbiddenReference(reference)) return;
      if (isArrayReference(reference)) {
        for (const type of typeArguments?.params ?? []) visitNested(type, seen);
        return;
      }
      const name = referenceName(typeName)?.name ?? null;
      if (!name || seen.has(name)) return;
      const declaration = types.get(name);
      if (!declaration) return;
      seen.add(name);
      if (declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
        for (const member of declaration.body.body) inspectMember(member, seen);
        for (const heritage of declaration.extends) {
          const expression = heritage.expression;
          if (expression.type !== AST_NODE_TYPES.Identifier) continue;
          visitTypeName(expression, seen);
        }
        return;
      }
      visitNested(declaration.typeAnnotation, seen);
    }

    function visitNested(node: TSESTree.TypeNode, seen: Set<string>): void {
      const current = unwrapType(node);
      switch (current.type) {
        case AST_NODE_TYPES.TSUnionType:
        case AST_NODE_TYPES.TSIntersectionType:
          for (const type of current.types) visitNested(type, seen);
          return;
        case AST_NODE_TYPES.TSArrayType:
          visitNested(current.elementType, seen);
          return;
        case AST_NODE_TYPES.TSTupleType:
          for (const type of current.elementTypes) visitNested(type, seen);
          return;
        case AST_NODE_TYPES.TSTypeLiteral:
          for (const member of current.members) inspectMember(member, seen);
          return;
        case AST_NODE_TYPES.TSTypeReference:
          visitTypeName(current.typeName, seen, current.typeArguments);
          return;
        default:
          return;
      }
    }

    function inspectMember(
      member: TSESTree.TypeElement,
      seen: Set<string>,
    ): void {
      if (
        member.type !== AST_NODE_TYPES.TSPropertySignature &&
        member.type !== AST_NODE_TYPES.TSMethodSignature
      ) {
        return;
      }
      const name = propertyName(member.key);
      if (!name || allowed.has(name) || reported.has(member)) return;
      const type =
        member.type === AST_NODE_TYPES.TSMethodSignature
          ? ({
              type: AST_NODE_TYPES.TSFunctionType,
              params: member.params,
              returnType: member.returnType,
              range: member.range,
              loc: member.loc,
            } as TSESTree.TSFunctionType)
          : member.typeAnnotation?.typeAnnotation;
      if (!type) return;
      if (
        exemptRenderCallbacks &&
        RENDER_CALLBACK_NAME.test(name) &&
        isFunctionType(type, new Set(seen))
      ) {
        return;
      }
      if (containsForbidden(type, new Set(seen))) {
        reported.add(member);
        context.report({
          node: member,
          messageId: "unexpectedProp",
          data: { propName: name },
        });
      }
      visitNested(type, new Set(seen));
    }

    function visitRoot(node: TSESTree.TypeNode): void {
      visitNested(node, new Set());
    }

    function rememberFunctionParameters(
      node:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression,
      name: string | null,
      exported: boolean,
    ): void {
      if (!shouldWalkParameters(name, exported)) return;
      const type = parameterType(node);
      if (type) extraRoots.push(type);
    }

    const componentVisitors = createComponentPropTypeVisitors({
      onPropProperty(node) {
        inspectMember(node, new Set());
      },
    });

    return {
      TSInterfaceDeclaration(node) {
        types.set(node.id.name, node);
        componentVisitors.TSInterfaceDeclaration(node);
      },
      TSTypeAliasDeclaration(node) {
        types.set(node.id.name, node);
        componentVisitors.TSTypeAliasDeclaration(node);
      },
      FunctionDeclaration(node) {
        componentVisitors.FunctionDeclaration(node);
        rememberFunctionParameters(
          node,
          node.id?.name ?? null,
          isExportedFunction(node),
        );
      },
      VariableDeclarator(node) {
        componentVisitors.VariableDeclarator(node);
        if (node.id.type !== AST_NODE_TYPES.Identifier || !node.init) return;
        const declaration = node.parent;
        const exported =
          declaration?.type === AST_NODE_TYPES.VariableDeclaration &&
          isExportedFunction(declaration);
        if (
          node.init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.init.type === AST_NODE_TYPES.FunctionExpression
        ) {
          rememberFunctionParameters(node.init, node.id.name, exported);
        }
      },
      ExportDefaultDeclaration(node) {
        componentVisitors.ExportDefaultDeclaration(node);
        if (
          node.declaration.type === AST_NODE_TYPES.ArrowFunctionExpression ||
          node.declaration.type === AST_NODE_TYPES.FunctionExpression
        ) {
          rememberFunctionParameters(node.declaration, null, true);
        }
      },
      "Program:exit"() {
        componentVisitors["Program:exit"]();
        for (const root of extraRoots) visitRoot(root);
      },
    };
  },
});

export default rule;
