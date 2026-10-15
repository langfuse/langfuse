import {
  OperationNodeTransformer,
  type CommonTableExpressionNode,
  type OperationNode,
  type QueryId,
  type SelectQueryNode,
  type TableNode,
  type WithNode,
} from "kysely";

import {
  ArrayJoinNode,
  ArrayIndexNode,
  FinalTableNode,
  LimitByNode,
  type ClickHouseSelectQueryNode,
} from "./nodes";

/**
 * Transformer that knows the ClickHouse extra fields on SelectQueryNode.
 *
 * Kysely's default {@link OperationNodeTransformer.transformSelectQuery}
 * reconstructs a SelectQueryNode from known slots and drops anything else —
 * so without this override, ARRAY JOIN / LIMIT BY / the `includeDeleted`
 * opt-out would vanish the moment any plugin walked the tree.
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
    if (FinalTableNode.is(node)) {
      return this.transformFinalTable(node) as unknown as T;
    }
    return super.transformNodeImpl(node, queryId);
  }

  protected transformArrayIndex(node: ArrayIndexNode): ArrayIndexNode {
    return ArrayIndexNode.create(
      this.transformNode(node.array),
      this.transformNode(node.index),
    );
  }

  protected transformFinalTable(node: FinalTableNode): FinalTableNode {
    return FinalTableNode.create(this.transformNode(node.table));
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
      ...(extra.includeDeleted ? { includeDeleted: true } : {}),
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

/**
 * Transformer for passes that rewrite physical relations: it tracks which
 * names resolve to a CTE, so a relation named like a registry table is left
 * alone when it reads a CTE of that name. Subclasses rewrite each select in
 * {@link rewriteSelect}, after its children, and ask {@link isCte}. The
 * compiler's bind-type scopes (`compiler.ts`) resolve names the same way.
 */
export abstract class CteScopedTransformer extends ClickHouseOperationNodeTransformer {
  /**
   * CTE names visible to the select being transformed: one set per enclosing
   * select that declares a WITH. Subqueries, nested WITH bodies and UNION
   * branches see every enclosing set. A CTE body sees every sibling CTE except
   * itself, matching ClickHouse: `WITH events_core AS (SELECT … FROM
   * events_core)` reads the table, unless an enclosing select declares
   * `events_core` too. Under WITH RECURSIVE only the recursive UNION member
   * reads the CTE; it is still treated as the table, so a rewrite errs toward
   * ClickHouse rejecting the query. Pushed before a select's children are
   * transformed and popped after, so it is empty between compiles.
   */
  private readonly cteScopes: Set<string>[] = [];

  protected abstract rewriteSelect(
    node: ClickHouseSelectQueryNode,
  ): ClickHouseSelectQueryNode;

  /** A schema-qualified table (`default.traces`) is never a CTE. */
  protected isCte(table: TableNode): boolean {
    if (table.table.schema) return false;
    const name = table.table.identifier.name;
    return this.cteScopes.some((scope) => scope.has(name));
  }

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    const ctes = cteNames(node.with);
    if (ctes.size > 0) this.cteScopes.push(ctes);
    try {
      return this.rewriteSelect(
        super.transformSelectQuery(node, queryId) as ClickHouseSelectQueryNode,
      );
    } finally {
      if (ctes.size > 0) this.cteScopes.pop();
    }
  }

  protected override transformWith(
    node: WithNode,
    queryId?: QueryId,
  ): WithNode {
    const full = this.cteScopes.pop() ?? new Set<string>();
    try {
      const expressions = node.expressions.map((expr) => {
        const visible = new Set(full);
        visible.delete(cteName(expr));
        this.cteScopes.push(visible);
        try {
          return this.transformNode(expr, queryId);
        } finally {
          this.cteScopes.pop();
        }
      });
      return { ...node, expressions };
    } finally {
      if (full.size > 0) this.cteScopes.push(full);
    }
  }
}

function cteName(expr: CommonTableExpressionNode): string {
  return expr.name.table.table.identifier.name;
}

function cteNames(node: WithNode | undefined): Set<string> {
  return new Set((node?.expressions ?? []).map(cteName));
}
