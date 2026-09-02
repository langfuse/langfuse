/**
 * Shape-keyed dedup lowering. Always-on: every compile walks this pass. The
 * physical idiom is chosen from facts declared once on the table
 * ({@link DEDUP_SPECS}) plus the query's shape — never written at a call site.
 *
 * Shapes, for a single physical FROM with no JOINs (the floor extent):
 *
 *  - **row** (point-lookup / list) — attach `ORDER BY <version> DESC` (as a
 *    trailing key if the caller already ordered) and `LIMIT 1 BY <key>`.
 *  - **aggregate** (GROUP BY / HAVING / window / sum-count-avg) — wrap the
 *    FROM in a subquery that applies the row idiom first, so the aggregate
 *    sees one row per key. ClickHouse evaluates LIMIT BY *after* GROUP BY,
 *    so attaching the clause to the outer select would limit groups, not
 *    input rows.
 *  - **skip** — DISTINCT-only (already collapses), existence (`SELECT 1` /
 *    `count()` + `LIMIT 1`), CTE names, joins, tables with no spec, or an
 *    already-present LIMIT BY (the caller's explicit `$call(limitBy)`).
 *
 * `strategy: "final"` is part of the declaration vocabulary but has no
 * emitter yet; declaring it is a compile error so a forgotten implementation
 * cannot silently ship undeduplicated SQL.
 */
import {
  AggregateFunctionNode,
  AliasNode,
  ColumnNode,
  FromNode,
  IdentifierNode,
  OrderByItemNode,
  OrderByNode,
  QueryNode,
  RawNode,
  ReferenceNode,
  SelectModifierNode,
  SelectQueryNode,
  SelectionNode,
  TableNode,
  ValueNode,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  type RootOperationNode,
} from "kysely";

import { QueryCompileError } from "./errors";
import { LimitByNode, type ClickHouseSelectQueryNode } from "./nodes";
import { DEDUP_SPECS, type DedupSpec } from "./schema";
import { stampCompiledTree } from "./tenancy";
import { ClickHouseOperationNodeTransformer } from "./transformer";

type PhysicalFrom = {
  tableName: string;
  alias?: string;
  fromItem: OperationNode;
};

const DOUBLE_COUNT_AGGREGATES = new Set(["count", "sum", "avg"]);

export class DedupLoweringPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const transformer = new DedupLoweringTransformer();
    const lowered = transformer.transformNode(args.node) as RootOperationNode;
    // A rewritten root is a new object; restamp so the compiler will emit.
    return stampCompiledTree(lowered);
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

class DedupLoweringTransformer extends ClickHouseOperationNodeTransformer {
  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    const withChildren = super.transformSelectQuery(
      node,
      queryId,
    ) as ClickHouseSelectQueryNode;
    return lowerSelect(withChildren, collectCteNames(withChildren));
  }
}

function collectCteNames(node: SelectQueryNode): Set<string> {
  const names = new Set<string>();
  for (const expr of node.with?.expressions ?? []) {
    names.add(expr.name.table.table.identifier.name);
  }
  return names;
}

function lowerSelect(
  node: ClickHouseSelectQueryNode,
  cteNames: Set<string>,
): ClickHouseSelectQueryNode {
  const from = singlePhysicalFrom(node, cteNames);
  if (!from) return node;

  const spec = DEDUP_SPECS[from.tableName];
  if (!spec) return node;

  if (spec.strategy === "final") {
    throw new QueryCompileError(
      `Dedup strategy "final" is declared on ${from.tableName} but has no emitter. Use strategy "limitBy" or implement FINAL lowering before declaring it.`,
    );
  }

  if (node.limitBy) {
    // Caller already attached LIMIT BY. Still pin the version sort so the
    // clause keeps the latest row when they forgot ORDER BY <version>.
    return ensureVersionOrder(node, from, spec);
  }

  const shape = classifyShape(node);
  if (shape === "skip") return node;
  if (shape === "aggregate") return wrapAggregate(node, from, spec);
  return attachRowDedup(node, from, spec);
}

function singlePhysicalFrom(
  node: SelectQueryNode,
  cteNames: Set<string>,
): PhysicalFrom | undefined {
  if (node.joins?.length) return undefined;
  const froms = node.from?.froms ?? [];
  if (froms.length !== 1) return undefined;
  const described = describeFrom(froms[0]);
  if (!described) return undefined;
  if (cteNames.has(described.tableName)) return undefined;
  return described;
}

function describeFrom(node: OperationNode): PhysicalFrom | undefined {
  if (AliasNode.is(node)) {
    const inner = describeFrom(node.node);
    if (!inner) return undefined;
    const alias = IdentifierNode.is(node.alias) ? node.alias.name : undefined;
    return { ...inner, alias, fromItem: node };
  }
  if (TableNode.is(node)) {
    return {
      tableName: node.table.identifier.name,
      fromItem: node,
    };
  }
  return undefined;
}

type QueryShape = "row" | "aggregate" | "skip";

function classifyShape(node: SelectQueryNode): QueryShape {
  if (isDistinctOnly(node) || isExistence(node)) return "skip";
  if (node.groupBy || node.having || hasWrappingAggregate(node)) {
    return "aggregate";
  }
  // Scalar max/min/argMax without GROUP BY already collapse versions;
  // attaching ORDER BY / LIMIT BY after the aggregate is illegal SQL.
  if (hasAnyAggregate(node)) return "skip";
  return "row";
}

function isDistinctOnly(node: SelectQueryNode): boolean {
  return (
    node.frontModifiers?.some(
      (modifier) =>
        SelectModifierNode.is(modifier) && modifier.modifier === "Distinct",
    ) ?? false
  );
}

function isExistence(node: SelectQueryNode): boolean {
  if (!isLimitOne(node) || node.groupBy) return false;
  const selections = node.selections ?? [];
  if (selections.length !== 1) return false;
  const expr = unwrapSelection(selections[0]);
  if (!expr) return false;
  if (ValueNode.is(expr) && expr.value === 1) return true;
  return AggregateFunctionNode.is(expr) && isCountFunc(expr.func);
}

function isLimitOne(node: SelectQueryNode): boolean {
  const limit = node.limit?.limit;
  return limit !== undefined && ValueNode.is(limit) && limit.value === 1;
}

function hasWrappingAggregate(node: SelectQueryNode): boolean {
  let found = false;
  walk(node.selections, (child) => {
    if (!AggregateFunctionNode.is(child)) return;
    if (child.over || DOUBLE_COUNT_AGGREGATES.has(child.func.toLowerCase())) {
      found = true;
    }
  });
  return found;
}

function hasAnyAggregate(node: SelectQueryNode): boolean {
  let found = false;
  walk(node.selections, (child) => {
    if (AggregateFunctionNode.is(child)) found = true;
  });
  return found;
}

function isCountFunc(func: string): boolean {
  return func.toLowerCase() === "count";
}

function unwrapSelection(selection: OperationNode): OperationNode | undefined {
  if (!SelectionNode.is(selection)) return undefined;
  const inner = selection.selection;
  if (AliasNode.is(inner)) return inner.node;
  return inner;
}

function attachRowDedup(
  node: ClickHouseSelectQueryNode,
  from: PhysicalFrom,
  spec: DedupSpec,
): ClickHouseSelectQueryNode {
  return {
    ...ensureVersionOrder(node, from, spec),
    limitBy: limitByNode(from, spec),
  };
}

function wrapAggregate(
  node: ClickHouseSelectQueryNode,
  from: PhysicalFrom,
  spec: DedupSpec,
): ClickHouseSelectQueryNode {
  const inner: ClickHouseSelectQueryNode = {
    kind: "SelectQueryNode",
    from: FromNode.create([from.fromItem]),
    selections: [SelectionNode.createSelectAll()],
    ...(node.where ? { where: node.where } : {}),
    orderBy: versionOrderBy(from, spec),
    limitBy: limitByNode(from, spec),
  };
  const alias = IdentifierNode.create(from.alias ?? from.tableName);
  return {
    ...node,
    from: FromNode.create([AliasNode.create(inner, alias)]),
    where: undefined,
  };
}

function ensureVersionOrder(
  node: ClickHouseSelectQueryNode,
  from: PhysicalFrom,
  spec: DedupSpec,
): ClickHouseSelectQueryNode {
  if (orderByHasColumn(node.orderBy, spec.version)) return node;
  return QueryNode.cloneWithOrderByItems(node, [
    versionOrderItem(from, spec),
  ]) as ClickHouseSelectQueryNode;
}

function versionOrderBy(from: PhysicalFrom, spec: DedupSpec): OrderByNode {
  return OrderByNode.create([versionOrderItem(from, spec)]);
}

function versionOrderItem(
  from: PhysicalFrom,
  spec: DedupSpec,
): OrderByItemNode {
  return OrderByItemNode.create(
    qualifyColumn(from, spec.version),
    RawNode.createWithSql("desc"),
  );
}

function limitByNode(from: PhysicalFrom, spec: DedupSpec): LimitByNode {
  return LimitByNode.create(
    ValueNode.createImmediate(1),
    spec.key.map((column) => qualifyColumn(from, column)),
  );
}

function qualifyColumn(from: PhysicalFrom, column: string): OperationNode {
  const col = ColumnNode.create(column);
  return from.alias
    ? ReferenceNode.create(col, TableNode.create(from.alias))
    : col;
}

function orderByHasColumn(
  orderBy: OrderByNode | undefined,
  column: string,
): boolean {
  if (!orderBy) return false;
  return orderBy.items.some((item) => columnNameOf(item.orderBy) === column);
}

function columnNameOf(node: OperationNode): string | undefined {
  if (ColumnNode.is(node)) return node.column.name;
  if (ReferenceNode.is(node) && ColumnNode.is(node.column)) {
    return node.column.column.name;
  }
  return undefined;
}

function walk(value: unknown, visit: (node: OperationNode) => void): void {
  if (!value || typeof value !== "object") return;
  if (
    "kind" in value &&
    typeof (value as { kind: unknown }).kind === "string"
  ) {
    visit(value as OperationNode);
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) walk(item, visit);
    } else {
      walk(child, visit);
    }
  }
}
