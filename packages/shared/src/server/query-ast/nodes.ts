import {
  type IdentifierNode,
  type OperationNode,
  type SelectQueryNode,
} from "kysely";

/**
 * ClickHouse `ARRAY JOIN` / `LEFT ARRAY JOIN` / `INNER ARRAY JOIN`.
 *
 * Not a Kysely `OperationNode` kind — Kysely's `kind` union is closed, so a
 * real custom kind would collapse to `never`. These nodes live as extra
 * fields on {@link ClickHouseSelectQueryNode}. Children (`expression`,
 * `alias`) are traced Kysely nodes, not raw SQL.
 */
export type ArrayJoinVariant = "default" | "left" | "inner";

type ArrayJoinItemNode = {
  readonly expression: OperationNode;
  readonly alias: IdentifierNode;
};

export type ArrayJoinNode = {
  readonly kind: "ArrayJoinNode";
  readonly variant: ArrayJoinVariant;
  readonly items: ReadonlyArray<ArrayJoinItemNode>;
};

export const ArrayJoinNode = {
  is(node: { kind: string }): node is ArrayJoinNode {
    return node.kind === "ArrayJoinNode";
  },
  create(
    items: ReadonlyArray<ArrayJoinItemNode>,
    variant: ArrayJoinVariant = "default",
  ): ArrayJoinNode {
    return Object.freeze({
      kind: "ArrayJoinNode",
      variant,
      items: Object.freeze([...items]),
    });
  },
};

/**
 * ClickHouse `LIMIT n BY col1, col2, ...`.
 *
 * Distinct from Kysely's `LimitNode` (`LIMIT n`). ClickHouse places LIMIT BY
 * after ORDER BY and before a plain LIMIT.
 */
export type LimitByNode = {
  readonly kind: "LimitByNode";
  readonly count: OperationNode;
  readonly columns: ReadonlyArray<OperationNode>;
};

export const LimitByNode = {
  is(node: { kind: string }): node is LimitByNode {
    return node.kind === "LimitByNode";
  },
  create(
    count: OperationNode,
    columns: ReadonlyArray<OperationNode>,
  ): LimitByNode {
    return Object.freeze({
      kind: "LimitByNode",
      count,
      columns: Object.freeze([...columns]),
    });
  },
};

/**
 * ClickHouse array subscript `arr[index]`. Children are traced nodes
 * (typically a column ref and an `indexOf(...)` FunctionNode), not raw SQL.
 *
 * Same closed-`kind` constraint as ARRAY JOIN: not a Kysely visitor-map
 * kind. The dialect compiler and transformer special-case this object.
 */
export type ArrayIndexNode = {
  readonly kind: "ArrayIndexNode";
  readonly array: OperationNode;
  readonly index: OperationNode;
};

export const ArrayIndexNode = {
  is(node: { kind: string }): node is ArrayIndexNode {
    return node.kind === "ArrayIndexNode";
  },
  create(array: OperationNode, index: OperationNode): ArrayIndexNode {
    return Object.freeze({
      kind: "ArrayIndexNode",
      array,
      index,
    });
  },
};

/**
 * Select query extended with ClickHouse-only clauses.
 * Extra fields are ignored by Kysely's default compiler/transformer; our
 * dialect compiler and {@link ClickHouseOperationNodeTransformer} are the
 * ones that read them. Tenancy is stamped by identity (WeakSet), not a
 * copyable property on this node.
 */
export type ClickHouseSelectQueryNode = SelectQueryNode & {
  readonly arrayJoins?: ReadonlyArray<ArrayJoinNode>;
  readonly limitBy?: LimitByNode;
};

export function isClickHouseSelectQueryNode(
  node: OperationNode,
): node is ClickHouseSelectQueryNode {
  return node.kind === "SelectQueryNode";
}
