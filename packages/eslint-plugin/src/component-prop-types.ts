import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

type PropTypeCallbacks = {
  onPropProperty: (node: TSESTree.TSPropertySignature) => void;
  onDestructuredProp?: (node: TSESTree.Property) => void;
};

const REACT_COMPONENT_TYPES = new Set([
  "FC",
  "FunctionComponent",
  "VFC",
  "VoidFunctionComponent",
]);

function isCapitalizedName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

function isJsxNode(node: TSESTree.Node): boolean {
  return (
    node.type === AST_NODE_TYPES.JSXElement ||
    node.type === AST_NODE_TYPES.JSXFragment
  );
}

function isNullLiteral(node: TSESTree.Node): boolean {
  return node.type === AST_NODE_TYPES.Literal && node.value === null;
}

function isReactCreateElementCall(node: TSESTree.CallExpression): boolean {
  const callee = node.callee;
  return (
    (callee.type === AST_NODE_TYPES.Identifier &&
      callee.name === "createElement") ||
    (callee.type === AST_NODE_TYPES.MemberExpression &&
      callee.object.type === AST_NODE_TYPES.Identifier &&
      callee.object.name === "React" &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      callee.property.name === "createElement")
  );
}

function expressionReturnsJsxOrNull(
  node: TSESTree.Node | null | undefined,
): boolean {
  if (!node) return false;
  if (isJsxNode(node) || isNullLiteral(node)) return true;

  switch (node.type) {
    case AST_NODE_TYPES.ConditionalExpression:
      return [node.consequent, node.alternate].some(expressionReturnsJsxOrNull);
    case AST_NODE_TYPES.LogicalExpression:
      return [node.left, node.right].some(expressionReturnsJsxOrNull);
    case AST_NODE_TYPES.CallExpression:
      return (
        isReactCreateElementCall(node) ||
        node.arguments.some((argument) => expressionReturnsJsxOrNull(argument))
      );
    case AST_NODE_TYPES.ArrowFunctionExpression:
    case AST_NODE_TYPES.FunctionExpression:
      return functionReturnsJsxOrNull(node);
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
    case AST_NODE_TYPES.TSTypeAssertion:
      return expressionReturnsJsxOrNull(node.expression);
    default:
      return false;
  }
}

function statementReturnsJsxOrNull(
  statement: TSESTree.Statement | null | undefined,
): boolean {
  if (!statement) return false;
  switch (statement.type) {
    case AST_NODE_TYPES.ReturnStatement:
      return expressionReturnsJsxOrNull(statement.argument);
    case AST_NODE_TYPES.BlockStatement:
      return statement.body.some(statementReturnsJsxOrNull);
    case AST_NODE_TYPES.IfStatement:
      return [statement.consequent, statement.alternate].some(
        statementReturnsJsxOrNull,
      );
    case AST_NODE_TYPES.SwitchStatement:
      return statement.cases.some((switchCase) =>
        switchCase.consequent.some(statementReturnsJsxOrNull),
      );
    case AST_NODE_TYPES.TryStatement:
      return [
        statement.block,
        statement.handler?.body,
        statement.finalizer,
      ].some(statementReturnsJsxOrNull);
    default:
      return false;
  }
}

function functionReturnsJsxOrNull(
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression,
): boolean {
  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression && node.expression) {
    return expressionReturnsJsxOrNull(node.body);
  }

  return (node.body as TSESTree.BlockStatement).body.some(
    statementReturnsJsxOrNull,
  );
}

function getTypeName(typeName: TSESTree.EntityName): string | null {
  if (typeName.type === AST_NODE_TYPES.Identifier) return typeName.name;
  return getTypeName((typeName as TSESTree.TSQualifiedName).right);
}

function getTypeReferenceArguments(
  node: TSESTree.TSTypeReference,
): TSESTree.TypeNode[] {
  return node.typeArguments?.params ?? [];
}

function getCallTypeArguments(
  node: TSESTree.CallExpression,
): TSESTree.TypeNode[] {
  return node.typeArguments?.params ?? [];
}

function getReactComponentPropsType(
  annotation: TSESTree.TypeNode,
): TSESTree.TypeNode | null {
  if (annotation.type !== AST_NODE_TYPES.TSTypeReference) return null;
  const typeName = getTypeName(annotation.typeName);
  if (!typeName || !REACT_COMPONENT_TYPES.has(typeName)) return null;
  return getTypeReferenceArguments(annotation)[0] ?? null;
}

function getClassPropsType(
  node: TSESTree.ClassDeclaration | TSESTree.ClassExpression,
): TSESTree.TypeNode | null {
  const superClass = node.superClass;
  if (!superClass) return null;
  const isComponentSuperclass =
    (superClass.type === AST_NODE_TYPES.Identifier &&
      superClass.name === "Component") ||
    (superClass.type === AST_NODE_TYPES.MemberExpression &&
      superClass.property.type === AST_NODE_TYPES.Identifier &&
      superClass.property.name === "Component");

  if (!isComponentSuperclass) {
    return null;
  }
  return node.superTypeArguments?.params[0] ?? null;
}

function getForwardRefPropsType(
  node: TSESTree.CallExpression,
): TSESTree.TypeNode | null {
  const callee = node.callee;
  const isForwardRef =
    (callee.type === AST_NODE_TYPES.Identifier &&
      callee.name === "forwardRef") ||
    (callee.type === AST_NODE_TYPES.MemberExpression &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      callee.property.name === "forwardRef");

  if (!isForwardRef) return null;
  return getCallTypeArguments(node)[1] ?? null;
}

function isComponentWrapperCall(
  node: TSESTree.Node,
): node is TSESTree.CallExpression {
  if (node.type !== AST_NODE_TYPES.CallExpression) return false;
  const callee = node.callee;
  return (
    (callee.type === AST_NODE_TYPES.Identifier &&
      (callee.name === "memo" || callee.name === "forwardRef")) ||
    (callee.type === AST_NODE_TYPES.MemberExpression &&
      callee.property.type === AST_NODE_TYPES.Identifier &&
      (callee.property.name === "memo" ||
        callee.property.name === "forwardRef"))
  );
}

function unwrapComponentInit(node: TSESTree.Node): TSESTree.Node {
  let current = node;
  while (isComponentWrapperCall(current) && current.arguments[0]) {
    const firstArg = current.arguments[0];
    if (
      firstArg.type !== AST_NODE_TYPES.ArrowFunctionExpression &&
      firstArg.type !== AST_NODE_TYPES.FunctionExpression &&
      firstArg.type !== AST_NODE_TYPES.CallExpression
    ) {
      break;
    }
    current = firstArg;
  }
  return current;
}

function getWrappedForwardRefPropsType(
  node: TSESTree.Node,
): TSESTree.TypeNode | null {
  let current = node;
  while (isComponentWrapperCall(current)) {
    const propsType = getForwardRefPropsType(current);
    if (propsType) return propsType;

    const firstArg = current.arguments[0];
    if (firstArg?.type !== AST_NODE_TYPES.CallExpression) break;
    current = firstArg;
  }
  return null;
}

function getFunctionPropsType(
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression,
): TSESTree.TypeNode | null {
  const firstParam = node.params[0];
  if (!firstParam || firstParam.type === AST_NODE_TYPES.TSParameterProperty) {
    return null;
  }
  return firstParam.typeAnnotation?.typeAnnotation ?? null;
}

function visitDestructuredProps(
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression,
  callbacks: PropTypeCallbacks,
): void {
  const firstParam = node.params[0];
  if (firstParam?.type !== AST_NODE_TYPES.ObjectPattern) return;
  firstParam.properties.forEach((property) => {
    if (property.type === AST_NODE_TYPES.Property) {
      callbacks.onDestructuredProp?.(property);
    }
  });
}

export function createComponentPropTypeVisitors(callbacks: PropTypeCallbacks) {
  const typeDeclarations = new Map<
    string,
    TSESTree.TSInterfaceDeclaration | TSESTree.TSTypeAliasDeclaration
  >();
  const propTypeRoots: TSESTree.TypeNode[] = [];

  function addPropTypeRoot(typeNode: TSESTree.TypeNode | null): void {
    if (typeNode) propTypeRoots.push(typeNode);
  }

  function visitTypeNode(
    node: TSESTree.TypeNode,
    seen = new Set<string>(),
  ): void {
    switch (node.type) {
      case AST_NODE_TYPES.TSTypeLiteral:
        node.members.forEach((member) => {
          if (member.type === AST_NODE_TYPES.TSPropertySignature) {
            callbacks.onPropProperty(member);
          }
        });
        return;
      case AST_NODE_TYPES.TSIntersectionType:
      case AST_NODE_TYPES.TSUnionType:
        node.types.forEach((type) => visitTypeNode(type, seen));
        return;
      case AST_NODE_TYPES.TSTypeReference: {
        const typeName = getTypeName(node.typeName);
        const reactPropsType = getReactComponentPropsType(node);
        if (reactPropsType) {
          visitTypeNode(reactPropsType, seen);
          return;
        }

        if (!typeName || seen.has(typeName)) return;
        const declaration = typeDeclarations.get(typeName);
        if (!declaration) return;
        seen.add(typeName);

        visitDeclaration(declaration, seen);
        return;
      }
      default:
        return;
    }
  }

  function getHeritageName(
    expression: TSESTree.Identifier | TSESTree.MemberExpression,
  ): string | null {
    if (expression.type === AST_NODE_TYPES.Identifier) return expression.name;
    return (expression.property as TSESTree.Identifier).name;
  }

  function visitDeclaration(
    declaration:
      | TSESTree.TSInterfaceDeclaration
      | TSESTree.TSTypeAliasDeclaration,
    seen: Set<string>,
  ): void {
    if (declaration.type === AST_NODE_TYPES.TSInterfaceDeclaration) {
      declaration.body.body.forEach((member) => {
        if (member.type === AST_NODE_TYPES.TSPropertySignature) {
          callbacks.onPropProperty(member);
        }
      });
      declaration.extends?.forEach((heritage) => {
        const heritageTypeName = getHeritageName(
          heritage.expression as
            | TSESTree.Identifier
            | TSESTree.MemberExpression,
        );
        visitDeclarationByName(heritageTypeName, seen);
      });
      return;
    }
    visitTypeNode(declaration.typeAnnotation, seen);
  }

  function visitDeclarationByName(
    typeName: string | null,
    seen: Set<string>,
  ): void {
    if (!typeName || seen.has(typeName)) return;
    const declaration = typeDeclarations.get(typeName);
    if (!declaration) return;
    seen.add(typeName);
    visitDeclaration(declaration, seen);
  }

  function maybeAddFunctionComponent(
    node:
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression,
    name: string | null,
  ): void {
    if (name && !isCapitalizedName(name)) return;
    if (!functionReturnsJsxOrNull(node)) return;
    addPropTypeRoot(getFunctionPropsType(node));
    visitDestructuredProps(node, callbacks);
  }

  return {
    TSInterfaceDeclaration(node: TSESTree.TSInterfaceDeclaration) {
      typeDeclarations.set(node.id.name, node);
    },
    TSTypeAliasDeclaration(node: TSESTree.TSTypeAliasDeclaration) {
      typeDeclarations.set(node.id.name, node);
    },
    FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
      maybeAddFunctionComponent(node, node.id?.name ?? null);
    },
    VariableDeclarator(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;
      if (!isCapitalizedName(node.id.name)) return;

      const variableType = node.id.typeAnnotation?.typeAnnotation;
      if (variableType) {
        addPropTypeRoot(getReactComponentPropsType(variableType));
      }

      if (!node.init) return;

      const init = unwrapComponentInit(node.init);
      if (
        init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        init.type === AST_NODE_TYPES.FunctionExpression
      ) {
        maybeAddFunctionComponent(init, node.id.name);
      }
      if (init.type === AST_NODE_TYPES.ClassExpression) {
        addPropTypeRoot(getClassPropsType(init));
      }
      if (node.init.type === AST_NODE_TYPES.CallExpression) {
        addPropTypeRoot(getWrappedForwardRefPropsType(node.init));
      }
    },
    ClassDeclaration(node: TSESTree.ClassDeclaration) {
      if (!node.id || !isCapitalizedName(node.id.name)) return;
      addPropTypeRoot(getClassPropsType(node));
    },
    "Program:exit"() {
      const seen = new Set<string>();
      propTypeRoots.forEach((typeNode) => visitTypeNode(typeNode, seen));
    },
  };
}
