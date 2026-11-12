import { type ASTNode, type FilterNode } from "../ast";
import { type FieldRegistry } from "../fields";
import { parse, serialize } from "../langQ";

/** Update one value group through the AST, preserving target and matching mode. */
export function replaceFilterValues(
  expression: string,
  values: readonly string[],
  registry: FieldRegistry,
): string | null {
  if (values.length === 0) return null;
  const parsed = parse(expression, registry);
  const node = parsed.ast;
  const filter = node?.kind === "not" ? node.child : node;
  if (!parsed.valid || filter?.kind !== "filter") return expression;
  const ref = registry.resolveField(filter.key);
  const exactSingleton =
    filter.op === "=" &&
    filter.values.length > 1 &&
    values.length === 1 &&
    ref?.type === "field" &&
    ref.field.syncMode === "textSearch";
  const next: FilterNode = {
    ...filter,
    op: exactSingleton ? "exact" : filter.op,
    values: [...values],
  };
  const ast: ASTNode = node?.kind === "not" ? { ...node, child: next } : next;
  return serialize(ast, registry);
}
