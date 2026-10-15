import {
  AliasNode,
  OperationNodeTransformer,
  SelectQueryNode,
  TableNode,
  type CommonTableExpressionNode,
  type OperationNode,
  type QueryId,
  type WithNode,
} from "kysely";

import { UnscopedRelationError } from "./errors";
import {
  ArrayJoinNode,
  ArrayIndexNode,
  FinalTableNode,
  LimitByNode,
  unwrapFinalTable,
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
    assertNoSiblingCycle(node);
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

/**
 * Rejects sibling CTEs that read each other (`a` → `b` → `a`). ClickHouse
 * resolves a read of a CTE that is still being resolved to the table of that
 * name, so one reference reads the CTE on one path and the table on another,
 * and no scope can tell a pass which. A body reading its own name is not a
 * cycle: that read is always the table. Every unqualified FROM/JOIN name in a
 * body counts as a read, nested selects included, so a nested WITH that
 * shadows a sibling name is rejected too.
 */
function assertNoSiblingCycle(node: WithNode): void {
  const names = cteNames(node);
  const reads = new Map(
    node.expressions.map((expr) => {
      const name = cteName(expr);
      const read = relationNames(expr.expression);
      return [
        name,
        [...read].filter((other) => other !== name && names.has(other)),
      ];
    }),
  );
  const done = new Set<string>();
  const path: string[] = [];
  const visit = (name: string) => {
    if (path.includes(name)) {
      throw new UnscopedRelationError(
        `CTEs that read each other (${[...path.slice(path.indexOf(name)), name].join(" → ")}) are rejected: ClickHouse reads the table, not the CTE, on part of the cycle, so the tenancy pass cannot scope it.`,
      );
    }
    if (done.has(name)) return;
    path.push(name);
    for (const next of reads.get(name) ?? []) visit(next);
    path.pop();
    done.add(name);
  };
  for (const name of names) visit(name);
}

/** Unqualified table names read in FROM/JOIN anywhere under `value`. */
function relationNames(value: unknown, found = new Set<string>()): Set<string> {
  if (!value || typeof value !== "object") return found;
  if (isOperationNode(value) && SelectQueryNode.is(value)) {
    const relations = [
      ...(value.from?.froms ?? []),
      ...(value.joins ?? []).map((join) => join.table),
    ];
    for (const relation of relations) {
      const table = relationTable(relation);
      if (table && !table.table.schema) found.add(table.table.identifier.name);
    }
  }
  for (const child of Object.values(value)) relationNames(child, found);
  return found;
}

function isOperationNode(value: object): value is OperationNode {
  return "kind" in value && typeof value.kind === "string";
}

function relationTable(node: OperationNode): TableNode | undefined {
  if (FinalTableNode.is(node)) return relationTable(unwrapFinalTable(node));
  if (AliasNode.is(node)) return relationTable(node.node);
  return TableNode.is(node) ? node : undefined;
}
