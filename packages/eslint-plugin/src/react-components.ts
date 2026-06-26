import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

type PropTypeCallbacks = {
  onPropProperty: (node: TSESTree.TSPropertySignature) => void;
  onDestructuredProp?: (node: TSESTree.Property) => void;
};

type RootElementCallbacks = {
  onRootElement: (node: TSESTree.JSXElement) => void;
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
      return (
        expressionReturnsJsxOrNull(node.consequent) ||
        expressionReturnsJsxOrNull(node.alternate)
      );
    case AST_NODE_TYPES.LogicalExpression:
      return (
        expressionReturnsJsxOrNull(node.left) ||
        expressionReturnsJsxOrNull(node.right)
      );
    case AST_NODE_TYPES.CallExpression:
      if (isReactCreateElementCall(node)) return true;
      for (const argument of node.arguments) {
        if (expressionReturnsJsxOrNull(argument)) return true;
      }
      return false;
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

function visitRootElementsInExpression(
  node: TSESTree.Node | null | undefined,
  callbacks: RootElementCallbacks,
): void {
  if (!node) return;

  switch (node.type) {
    case AST_NODE_TYPES.JSXElement:
      callbacks.onRootElement(node);
      return;
    case AST_NODE_TYPES.JSXFragment:
      for (const child of node.children) {
        if (child.type === AST_NODE_TYPES.JSXElement) {
          callbacks.onRootElement(child);
        } else if (child.type === AST_NODE_TYPES.JSXFragment) {
          visitRootElementsInExpression(child, callbacks);
        } else if (child.type === AST_NODE_TYPES.JSXExpressionContainer) {
          visitRootElementsInExpression(child.expression, callbacks);
        }
      }
      return;
    case AST_NODE_TYPES.ConditionalExpression:
      visitRootElementsInExpression(node.consequent, callbacks);
      visitRootElementsInExpression(node.alternate, callbacks);
      return;
    case AST_NODE_TYPES.LogicalExpression:
      visitRootElementsInExpression(node.left, callbacks);
      visitRootElementsInExpression(node.right, callbacks);
      return;
    case AST_NODE_TYPES.TSAsExpression:
    case AST_NODE_TYPES.TSNonNullExpression:
    case AST_NODE_TYPES.TSSatisfiesExpression:
      visitRootElementsInExpression(node.expression, callbacks);
      return;
    default:
      return;
  }
}

function visitRootElementsInStatement(
  statement: TSESTree.Statement | null | undefined,
  callbacks: RootElementCallbacks,
): void {
  if (!statement) return;

  switch (statement.type) {
    case AST_NODE_TYPES.ReturnStatement:
      visitRootElementsInExpression(statement.argument, callbacks);
      return;
    case AST_NODE_TYPES.BlockStatement:
      for (const child of statement.body) {
        visitRootElementsInStatement(child, callbacks);
      }
      return;
    case AST_NODE_TYPES.IfStatement:
      visitRootElementsInStatement(statement.consequent, callbacks);
      visitRootElementsInStatement(statement.alternate, callbacks);
      return;
    case AST_NODE_TYPES.SwitchStatement:
      for (const switchCase of statement.cases) {
        for (const child of switchCase.consequent) {
          visitRootElementsInStatement(child, callbacks);
        }
      }
      return;
    case AST_NODE_TYPES.TryStatement:
      visitRootElementsInStatement(statement.block, callbacks);
      visitRootElementsInStatement(statement.handler?.body, callbacks);
      visitRootElementsInStatement(statement.finalizer, callbacks);
      return;
    default:
      return;
  }
}

function visitRootElementsInFunction(
  node:
    | TSESTree.ArrowFunctionExpression
    | TSESTree.FunctionDeclaration
    | TSESTree.FunctionExpression,
  callbacks: RootElementCallbacks,
): void {
  if (node.type === AST_NODE_TYPES.ArrowFunctionExpression && node.expression) {
    visitRootElementsInExpression(node.body, callbacks);
    return;
  }

  for (const statement of (node.body as TSESTree.BlockStatement).body) {
    visitRootElementsInStatement(statement, callbacks);
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
      for (const child of statement.body) {
        if (statementReturnsJsxOrNull(child)) return true;
      }
      return false;
    case AST_NODE_TYPES.IfStatement:
      return (
        statementReturnsJsxOrNull(statement.consequent) ||
        statementReturnsJsxOrNull(statement.alternate)
      );
    case AST_NODE_TYPES.SwitchStatement:
      for (const switchCase of statement.cases) {
        for (const child of switchCase.consequent) {
          if (statementReturnsJsxOrNull(child)) return true;
        }
      }
      return false;
    case AST_NODE_TYPES.TryStatement:
      return (
        statementReturnsJsxOrNull(statement.block) ||
        statementReturnsJsxOrNull(statement.handler?.body) ||
        statementReturnsJsxOrNull(statement.finalizer)
      );
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

  for (const statement of (node.body as TSESTree.BlockStatement).body) {
    if (statementReturnsJsxOrNull(statement)) return true;
  }
  return false;
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

export function createComponentRootElementVisitors(
  callbacks: RootElementCallbacks,
) {
  function maybeVisitFunctionComponentRoots(
    node:
      | TSESTree.ArrowFunctionExpression
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression,
    name: string | null,
  ): void {
    if (name && !isCapitalizedName(name)) return;
    if (!functionReturnsJsxOrNull(node)) return;
    visitRootElementsInFunction(node, callbacks);
  }

  return {
    FunctionDeclaration(node: TSESTree.FunctionDeclaration) {
      maybeVisitFunctionComponentRoots(node, node.id?.name ?? null);
    },
    VariableDeclarator(node: TSESTree.VariableDeclarator) {
      if (node.id.type !== AST_NODE_TYPES.Identifier) return;
      if (!isCapitalizedName(node.id.name)) return;
      if (!node.init) return;

      const init = unwrapComponentInit(node.init);
      if (
        init.type === AST_NODE_TYPES.ArrowFunctionExpression ||
        init.type === AST_NODE_TYPES.FunctionExpression
      ) {
        maybeVisitFunctionComponentRoots(init, node.id.name);
      }
    },
  };
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
  for (const property of firstParam.properties) {
    if (property.type === AST_NODE_TYPES.Property) {
      callbacks.onDestructuredProp?.(property);
    }
  }
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
        for (const member of node.members) {
          if (member.type === AST_NODE_TYPES.TSPropertySignature) {
            callbacks.onPropProperty(member);
          }
        }
        return;
      case AST_NODE_TYPES.TSIntersectionType:
      case AST_NODE_TYPES.TSUnionType:
        for (const type of node.types) {
          visitTypeNode(type, seen);
        }
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
      for (const member of declaration.body.body) {
        if (member.type === AST_NODE_TYPES.TSPropertySignature) {
          callbacks.onPropProperty(member);
        }
      }
      for (const heritage of declaration.extends) {
        const heritageTypeName = getHeritageName(
          heritage.expression as
            | TSESTree.Identifier
            | TSESTree.MemberExpression,
        );
        visitDeclarationByName(heritageTypeName, seen);
      }
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
      for (const typeNode of propTypeRoots) {
        visitTypeNode(typeNode, seen);
      }
    },
  };
}
