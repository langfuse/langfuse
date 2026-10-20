import {
  AliasNode,
  IdentifierNode,
  TableNode,
  type OperationNode,
  type SelectQueryNode,
} from "kysely";

import { FinalTableNode, unwrapFinalTable } from "./nodes";

/**
 * One FROM item or JOIN table of a select, as every pass and the compiler
 * read it:
 *
 *     scores as s final  →  { source: scores, table: scores, alias: "s" }
 *     (select …) as sub  →  { source: (select …), alias: "sub" }
 *
 * FINAL wraps the aliased item, so one FINAL and then one alias are peeled.
 * Any other nesting (an alias around FINAL, FINAL around FINAL) stays in
 * `source`, which is then neither a table nor a subquery, and the tenancy
 * pass rejects it.
 */
export type Relation = {
  /** The item as the select holds it: `scores as s final`. */
  node: OperationNode;
  /** What the item reads: a table, a subquery, raw SQL or a table function. */
  source: OperationNode;
  /** `source` when it is a table reference, schema-qualified or not. */
  table?: TableNode;
  /** The alias, when it is a plain name. */
  alias?: string;
};

/** The FROM items of `node`, then its JOIN tables. */
export function selectRelations(node: SelectQueryNode): Relation[] {
  return [
    ...(node.from?.froms ?? []),
    ...(node.joins ?? []).map((join) => join.table),
  ].map(describeRelation);
}

export function describeRelation(node: OperationNode): Relation {
  const withoutFinal = FinalTableNode.is(node) ? unwrapFinalTable(node) : node;
  const aliased = AliasNode.is(withoutFinal) ? withoutFinal : undefined;
  const source = aliased ? aliased.node : withoutFinal;
  return {
    node,
    source,
    table: TableNode.is(source) ? source : undefined,
    alias:
      aliased && IdentifierNode.is(aliased.alias)
        ? aliased.alias.name
        : undefined,
  };
}
