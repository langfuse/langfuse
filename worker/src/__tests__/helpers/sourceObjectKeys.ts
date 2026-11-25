import { readFileSync } from "node:fs";
import ts from "typescript";

/**
 * Lists the object keys a TypeScript source file reads: `value.key`,
 * `value["key"]` and `"key" in value`. Method calls such as `list.push()` are
 * left out.
 */
export function objectKeysReadBy(sourcePath: string): string[] {
  const source = ts.createSourceFile(
    sourcePath,
    readFileSync(sourcePath, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const keys = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isPropertyAccessExpression(node) &&
      !(ts.isCallExpression(node.parent) && node.parent.expression === node)
    ) {
      keys.add(node.name.text);
    }
    if (
      ts.isElementAccessExpression(node) &&
      ts.isStringLiteralLike(node.argumentExpression)
    ) {
      keys.add(node.argumentExpression.text);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.InKeyword &&
      ts.isStringLiteralLike(node.left)
    ) {
      keys.add(node.left.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return [...keys].sort();
}
