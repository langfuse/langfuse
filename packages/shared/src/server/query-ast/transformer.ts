import {
  type FunctionNode,
  OperationNodeTransformer,
  type OperationNode,
  type QueryId,
  type SelectQueryNode,
} from "kysely";

import {
  ArrayJoinNode,
  LimitByNode,
  MetadataPrefilterNode,
  WithFillNode,
  asCustomNode,
  asOperationNode,
  transformCustomNode,
  type ClickHouseSelectQueryNode,
} from "./nodes";

/**
 * Transformer that knows the ClickHouse extra fields on SelectQueryNode.
 *
 * Kysely's default {@link OperationNodeTransformer.transformSelectQuery}
 * reconstructs a SelectQueryNode from known slots and drops anything else —
 * so without this override, ARRAY JOIN / LIMIT BY / WITH FILL would vanish
 * the moment any plugin walked the tree. It also rebuilds
 * each `CustomNode` (nodes.ts), a kind Kysely's transformer cannot dispatch.
 */
export class ClickHouseOperationNodeTransformer extends OperationNodeTransformer {
  protected override transformNodeImpl<T extends OperationNode>(
    node: T,
    queryId?: QueryId,
  ): T {
    const custom = asCustomNode(node);
    if (!custom) return super.transformNodeImpl(node, queryId);
    const transformed = transformCustomNode(
      custom,
      <C extends OperationNode>(child: C): C => this.transformNode(child),
    );
    // A custom node rebuilds as its own kind, so it is still a `T`.
    return asOperationNode(transformed) as T;
  }

  protected override transformFunction(
    node: FunctionNode,
    queryId?: QueryId,
  ): FunctionNode {
    const transformed = super.transformFunction(node, queryId);
    return MetadataPrefilterNode.is(node)
      ? MetadataPrefilterNode.create(transformed, node.metadataPrefilter)
      : transformed;
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
    // Kysely's rebuilt select plus the ClickHouse fields it dropped.
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
      ...(extra.withFill
        ? { withFill: this.transformWithFill(extra.withFill) }
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

  protected transformWithFill(node: WithFillNode): WithFillNode {
    return WithFillNode.create(
      this.transformNode(node.from),
      this.transformNode(node.to),
      this.transformNode(node.step),
    );
  }
}

/**
 * Transformer for passes that rewrite each select after its children:
 * subclasses rewrite one select at a time in {@link rewriteSelect}.
 */
export abstract class SelectRewriteTransformer extends ClickHouseOperationNodeTransformer {
  protected abstract rewriteSelect(
    node: ClickHouseSelectQueryNode,
  ): ClickHouseSelectQueryNode;

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    return this.rewriteSelect(
      super.transformSelectQuery(node, queryId) as ClickHouseSelectQueryNode,
    );
  }
}
