import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

import { createComponentPropTypeVisitors } from "../react-components.js";
import { createRule } from "../util.js";

type Options = [{ allowedPropNames?: string[] }];
type TypeDeclaration =
  | TSESTree.TSInterfaceDeclaration
  | TSESTree.TSTypeAliasDeclaration;
type Member = TSESTree.TSPropertySignature | TSESTree.TSMethodSignature;

const RENDER_CALLBACK = /^render(?:[A-Z]|$)/;

function propName(key: TSESTree.PropertyName): string | null {
  return key.type === AST_NODE_TYPES.Identifier ? key.name : null;
}

function referenceName(typeName: TSESTree.EntityName): {
  qualifier: string | null;
  name: string;
} | null {
  if (typeName.type === AST_NODE_TYPES.Identifier) {
    return { qualifier: null, name: typeName.name };
  }
  if (
    typeName.type === AST_NODE_TYPES.TSQualifiedName &&
    typeName.left.type === AST_NODE_TYPES.Identifier
  ) {
    return { qualifier: typeName.left.name, name: typeName.right.name };
  }
  return null;
}

function isNodeReference(node: TSESTree.TSTypeReference): boolean {
  const name = referenceName(node.typeName);
  if (!name) return false;
  if (name.name === "ReactNode" || name.name === "ReactElement") {
    return name.qualifier === null || name.qualifier === "React";
  }
  return name.name === "Element" && name.qualifier === "JSX";
}

const rule = createRule<Options, "unexpectedProp">({
  name: "no-node-slot-props",
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow ReactNode, ReactElement, and JSX.Element props on presentational components. Pass typed data, or children, instead of an arbitrary node slot. Function props named render* may return a node.",
    },
    schema: [
      {
        type: "object",
        properties: {
          allowedPropNames: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      unexpectedProp:
        "Prop '{{propName}}' is typed as a React node. Pass typed data and render it in the component. 'children' is the composition slot.",
    },
  },
  defaultOptions: [{ allowedPropNames: ["children"] }],
  create(context, [{ allowedPropNames = ["children"] }]) {
    const allowed = new Set(allowedPropNames);
    const types = new Map<string, TypeDeclaration>();
    const factoryTypes: TSESTree.TypeNode[] = [];
    const reported = new Set<TSESTree.Node>();
    const walked = new Set<TSESTree.Node>();

    function memberType(member: Member): TSESTree.TypeNode | undefined {
      return member.type === AST_NODE_TYPES.TSMethodSignature
        ? member.returnType?.typeAnnotation
        : member.typeAnnotation?.typeAnnotation;
    }

    function isRenderCallback(name: string, node: TSESTree.TypeNode): boolean {
      if (!RENDER_CALLBACK.test(name)) return false;
      if (node.type === AST_NODE_TYPES.TSFunctionType) return true;
      if (node.type !== AST_NODE_TYPES.TSTypeReference) return false;
      const referenced = referenceName(node.typeName);
      const declaration =
        referenced?.qualifier === null ? types.get(referenced.name) : undefined;
      return (
        declaration?.type === AST_NODE_TYPES.TSTypeAliasDeclaration &&
        declaration.typeAnnotation.type === AST_NODE_TYPES.TSFunctionType
      );
    }

    // `owner` is the prop to report when this type is a node. Type literals
    // start a new owner per member, so a nested field is reported on its own.
    function walk(
      node: TSESTree.TypeNode,
      seen: Set<string>,
      owner: Member | null,
    ): void {
      switch (node.type) {
        case AST_NODE_TYPES.TSUnionType:
        case AST_NODE_TYPES.TSIntersectionType:
          for (const type of node.types) walk(type, seen, owner);
          return;
        case AST_NODE_TYPES.TSArrayType:
          walk(node.elementType, seen, owner);
          return;
        case AST_NODE_TYPES.TSFunctionType:
          walk(node.returnType!.typeAnnotation, seen, owner);
          return;
        case AST_NODE_TYPES.TSTypeLiteral:
          for (const member of node.members) {
            if (
              member.type !== AST_NODE_TYPES.TSPropertySignature &&
              member.type !== AST_NODE_TYPES.TSMethodSignature
            ) {
              continue;
            }
            const name = propName(member.key);
            const type = name ? memberType(member) : undefined;
            if (
              !name ||
              !type ||
              allowed.has(name) ||
              isRenderCallback(name, type)
            ) {
              continue;
            }
            walk(type, new Set(seen), member);
          }
          return;
        case AST_NODE_TYPES.TSTypeReference: {
          if (isNodeReference(node) && owner && !reported.has(owner)) {
            reported.add(owner);
            context.report({
              node: owner,
              messageId: "unexpectedProp",
              data: { propName: propName(owner.key)! },
            });
          }
          const name = referenceName(node.typeName);
          if (name?.qualifier === null && name.name === "Array") {
            for (const type of node.typeArguments?.params ?? []) {
              walk(type, seen, owner);
            }
            return;
          }
          if (!name || name.qualifier !== null || seen.has(name.name)) return;
          const declaration = types.get(name.name);
          if (declaration?.type !== AST_NODE_TYPES.TSTypeAliasDeclaration) {
            return;
          }
          seen.add(name.name);
          walk(declaration.typeAnnotation, seen, owner);
          return;
        }
        default:
          return;
      }
    }

    function rememberFactory(
      node:
        | TSESTree.ArrowFunctionExpression
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression,
    ): void {
      const annotation = (node.params[0] as TSESTree.Identifier | undefined)
        ?.typeAnnotation?.typeAnnotation;
      if (annotation) factoryTypes.push(annotation);
    }

    const components = createComponentPropTypeVisitors({
      onPropProperty(node) {
        const parent = node.parent;
        if (parent?.type === AST_NODE_TYPES.TSTypeLiteral) {
          if (!walked.has(parent)) {
            walked.add(parent);
            walk(parent, new Set(), null);
          }
          return;
        }
        const name = propName(node.key);
        const type = node.typeAnnotation?.typeAnnotation;
        if (
          !name ||
          !type ||
          allowed.has(name) ||
          isRenderCallback(name, type)
        ) {
          return;
        }
        walk(type, new Set(), node);
      },
    });

    return {
      ...components,
      TSInterfaceDeclaration(node) {
        types.set(node.id.name, node);
        components.TSInterfaceDeclaration(node);
      },
      TSTypeAliasDeclaration(node) {
        types.set(node.id.name, node);
        components.TSTypeAliasDeclaration(node);
      },
      FunctionDeclaration(node) {
        components.FunctionDeclaration(node);
        if (node.parent?.type === AST_NODE_TYPES.ExportNamedDeclaration) {
          rememberFactory(node);
        }
      },
      "Program:exit"() {
        components["Program:exit"]();
        for (const type of factoryTypes) walk(type, new Set(), null);
      },
    };
  },
});

export default rule;
