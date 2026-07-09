import { AST_NODE_TYPES, type TSESTree } from "@typescript-eslint/utils";

/**
 * Returns the literal string value for expressions that are statically known at
 * lint time.
 *
 * Supports plain string literals and template literals without expressions.
 */
export function getStaticStringValue(
  node: TSESTree.Expression | TSESTree.SpreadElement,
): string | null {
  if (node.type === AST_NODE_TYPES.Literal && typeof node.value === "string") {
    return node.value;
  }

  if (
    node.type === AST_NODE_TYPES.TemplateLiteral &&
    node.expressions.length === 0
  ) {
    return node.quasis[0].value.cooked;
  }

  return null;
}

/**
 * Returns the static property key text when an object key can be resolved
 * without executing code.
 *
 * Supports identifier keys, string literal keys, and template literal keys
 * without expressions.
 */
export function getStaticPropertyKeyValue(
  key: TSESTree.PropertyName | TSESTree.PrivateIdentifier,
): string | null {
  if (key.type === AST_NODE_TYPES.Identifier) return key.name;

  if (key.type === AST_NODE_TYPES.Literal && typeof key.value === "string") {
    return key.value;
  }

  if (
    key.type === AST_NODE_TYPES.TemplateLiteral &&
    key.expressions.length === 0
  ) {
    return key.quasis[0].value.cooked;
  }

  return null;
}
