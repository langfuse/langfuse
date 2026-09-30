import {
  OperationNodeTransformer,
  type OperationNode,
  type QueryId,
  type SelectQueryNode,
} from "kysely";

import {
  ArrayJoinNode,
  ArrayIndexNode,
  LimitByNode,
  type ClickHouseSelectQueryNode,
} from "./nodes";

/**
 * Transformer that knows the ClickHouse extra fields on SelectQueryNode.
 *
 * Kysely's default {@link OperationNodeTransformer.transformSelectQuery}
 * reconstructs a SelectQueryNode from known slots and drops anything else —
 * so without this override, ARRAY JOIN / LIMIT BY / the tenancy stamp would
 * vanish the moment any plugin walked the tree.
 */
export class ClickHouseOperationNodeTransformer extends OperationNodeTransformer {
  protected override transformNodeImpl<T extends OperationNode>(
    node: T,
    queryId?: QueryId,
  ): T {
    if (ArrayIndexNode.is(node)) {
      // Anti-pattern: cast through `unknown`. ArrayIndexNode is a custom kind
      // outside Kysely's closed OperationNode union, so `transformArrayIndex`'s
      // return type cannot be proven assignable to the generic `T` the base
      // method is parameterized over. The `.is` guard above establishes at
      // runtime that `T` is ArrayIndexNode here, so the cast is sound.
      return this.transformArrayIndex(node) as unknown as T;
    }
    return super.transformNodeImpl(node, queryId);
  }

  protected transformArrayIndex(node: ArrayIndexNode): ArrayIndexNode {
    return ArrayIndexNode.create(
      this.transformNode(node.array),
      this.transformNode(node.index),
    );
  }

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    const transformed = super.transformSelectQuery(
      node,
      queryId,
    ) as ClickHouseSelectQueryNode;
    const extra = node as ClickHouseSelectQueryNode;
    return {
      ...transformed,
      ...(extra.arrayJoins
        ? {
            arrayJoins: extra.arrayJoins.map((n) => this.transformArrayJoin(n)),
          }
        : {}),
      ...(extra.limitBy
        ? { limitBy: this.transformLimitBy(extra.limitBy) }
        : {}),
    } as ClickHouseSelectQueryNode;
  }

  protected transformArrayJoin(node: ArrayJoinNode): ArrayJoinNode {
    return ArrayJoinNode.create(
      node.items.map((item) => ({
        expression: this.transformNode(item.expression),
        alias: this.transformNode(item.alias) as typeof item.alias,
      })),
      node.variant,
    );
  }

  protected transformLimitBy(node: LimitByNode): LimitByNode {
    return LimitByNode.create(
      this.transformNode(node.count),
      node.columns.map((column) => this.transformNode(column)),
    );
  }
}
