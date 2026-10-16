import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

export function getStaticPropertyName(
  node: TSESTree.Property | TSESTree.MemberExpression,
): string | null {
  const key = node.type === AST_NODE_TYPES.Property ? node.key : node.property;
  if (!node.computed && key.type === AST_NODE_TYPES.Identifier) return key.name;
  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === "string") {
    return key.value;
  }
  return null;
}

export function isStoryObject(node: TSESTree.ObjectExpression): boolean {
  const parent = node.parent;
  if (
    parent.type === AST_NODE_TYPES.CallExpression &&
    parent.arguments[0] === node &&
    parent.callee.type === AST_NODE_TYPES.MemberExpression &&
    getStaticPropertyName(parent.callee) === "story"
  ) {
    return true;
  }
  return (
    parent.type === AST_NODE_TYPES.VariableDeclarator &&
    parent.init === node &&
    parent.parent.parent.type === AST_NODE_TYPES.ExportNamedDeclaration
  );
}

export function isStorybookPlayFunction(
  node: TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression,
): boolean {
  const parent = node.parent;
  if (parent.type === AST_NODE_TYPES.Property) {
    return (
      parent.value === node &&
      getStaticPropertyName(parent) === "play" &&
      parent.parent.type === AST_NODE_TYPES.ObjectExpression &&
      isStoryObject(parent.parent)
    );
  }
  if (parent.type === AST_NODE_TYPES.AssignmentExpression) {
    return (
      parent.right === node &&
      parent.left.type === AST_NODE_TYPES.MemberExpression &&
      getStaticPropertyName(parent.left) === "play"
    );
  }
  return false;
}
