/**
 * Per-table dedup lowering. Always-on: every compile walks this pass.
 * The physical idiom is the one already used in production SQL for that
 * table ({@link DEDUP_SPECS}) — never a new collapse invented here.
 *
 *  - **none** — immutable at read time (`events_core` / `events_full`).
 *    Leave the query unchanged. No FINAL, no LIMIT BY.
 *  - **limitBy** — existing legacy idiom: `ORDER BY <version> DESC`
 *    `LIMIT 1 BY <key>` on row reads; wrap the FROM first for
 *    aggregates / DISTINCT so LIMIT BY runs on input rows. Used by
 *    traces / observations / scores point and list reads. A caller
 *    ORDER BY on another column wraps so the version sort is the
 *    LIMIT BY input order.
 *  - **final** — existing `FROM <table> FINAL` idiom. Declaring it
 *    without an emitter is a compile error (fail-closed).
 *
 * Omit the spec until a family is migrated. `$call(limitBy)` remains
 * for non-version LIMIT BY the registry does not own.
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
  type RootOperationNode,
} from "kysely";

import { QueryCompileError } from "./errors";
import {
  FinalTableNode,
  LimitByNode,
  walkNodes,
  type ClickHouseSelectQueryNode,
} from "./nodes";
import { describeRelation } from "./relations";
import { DEDUP_SPECS, type DedupSpec } from "./schema";
import { stampCompiledTree } from "./tenancy";
import { SelectRewriteTransformer } from "./transformer";

type PhysicalFrom = {
  tableName: string;
  alias?: string;
  fromItem: OperationNode;
};

type LimitBySpec = Extract<DedupSpec, { strategy: "limitBy" }>;

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

class DedupLoweringTransformer extends SelectRewriteTransformer {
  protected rewriteSelect(
    node: ClickHouseSelectQueryNode,
  ): ClickHouseSelectQueryNode {
    return lowerSelect(node);
  }
}

function lowerSelect(
  node: ClickHouseSelectQueryNode,
): ClickHouseSelectQueryNode {
  const from = singlePhysicalFrom(node);
  if (!from) return node;

  const spec = DEDUP_SPECS[from.tableName];
  if (!spec || spec.strategy === "none") return node;
  assertLowerable(from, spec);

  if (node.limitBy) {
    // Caller already attached LIMIT BY. Still pin the version sort so the
    // clause keeps the latest row when they forgot ORDER BY <version>.
    return ensureVersionOrder(node, from, spec);
  }

  const shape = classifyShape(node);
  if (shape === "skip") return node;
  if (shape === "aggregate") return wrapPhysicalFrom(node, from, spec);
  return attachRowDedup(node, from, spec);
}

/** Narrows `spec` to `limitBy`: throws on the shapes the pass cannot lower. */
function assertLowerable(
  from: PhysicalFrom,
  spec: DedupSpec,
): asserts spec is LimitBySpec {
  if (spec.strategy === "final") {
    throw new QueryCompileError(
      `Dedup strategy "final" is declared on ${from.tableName} but has no emitter. Use strategy "limitBy" or implement FINAL lowering before declaring it.`,
    );
  }
  if (FinalTableNode.is(from.fromItem)) {
    throw new QueryCompileError(
      `FINAL cannot be combined with the limitBy dedup declared on ${from.tableName}: the registry already picks the latest version. Remove useFinal().`,
    );
  }
}

function singlePhysicalFrom(node: SelectQueryNode): PhysicalFrom | undefined {
  if (node.joins?.length) return undefined;
  const froms = node.from?.froms ?? [];
  if (froms.length !== 1) return undefined;
  const { node: fromItem, table, alias } = describeRelation(froms[0]);
  if (!table) return undefined;
  return {
    tableName: table.table.identifier.name,
    alias,
    fromItem,
  };
}

type QueryShape = "row" | "aggregate" | "skip";

function classifyShape(node: SelectQueryNode): QueryShape {
  if (isExistence(node)) return "skip";
  if (
    isDistinctOnly(node) ||
    node.groupBy ||
    node.having ||
    hasWrappingAggregate(node)
  ) {
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
  walkOuterSelect(node.selections, (child) => {
    if (!AggregateFunctionNode.is(child)) return;
    if (child.over || DOUBLE_COUNT_AGGREGATES.has(child.func.toLowerCase())) {
      found = true;
    }
  });
  return found;
}

function hasAnyAggregate(node: SelectQueryNode): boolean {
  let found = false;
  walkOuterSelect(node.selections, (child) => {
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
  spec: LimitBySpec,
): ClickHouseSelectQueryNode {
  // LIMIT BY keeps the first row per key in the query's full sort order.
  // A caller ORDER BY on any other column would make the version a
  // tiebreaker and could keep a stale row — wrap so collapse is inner.
  if (node.orderBy && !hasLeadingVersionDesc(node, spec)) {
    return wrapPhysicalFrom(node, from, spec);
  }
  return {
    ...ensureVersionOrder(node, from, spec),
    limitBy: limitByNode(from, spec),
  };
}

function wrapPhysicalFrom(
  node: ClickHouseSelectQueryNode,
  from: PhysicalFrom,
  spec: LimitBySpec,
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
  spec: LimitBySpec,
): ClickHouseSelectQueryNode {
  if (orderByHasColumn(node.orderBy, spec.version)) return node;
  return QueryNode.cloneWithOrderByItems(node, [
    versionOrderItem(from, spec),
  ]) as ClickHouseSelectQueryNode;
}

function versionOrderBy(from: PhysicalFrom, spec: LimitBySpec): OrderByNode {
  return OrderByNode.create([versionOrderItem(from, spec)]);
}

function versionOrderItem(
  from: PhysicalFrom,
  spec: LimitBySpec,
): OrderByItemNode {
  return OrderByItemNode.create(
    qualifyColumn(from, spec.version),
    RawNode.createWithSql("desc"),
  );
}

function limitByNode(from: PhysicalFrom, spec: LimitBySpec): LimitByNode {
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

function hasLeadingVersionDesc(
  node: SelectQueryNode,
  spec: LimitBySpec,
): boolean {
  const first = node.orderBy?.items[0];
  return (
    first !== undefined &&
    columnNameOf(first.orderBy) === spec.version &&
    isDescending(first)
  );
}

function isDescending(item: OrderByItemNode): boolean {
  const direction = item.direction;
  if (!direction || !RawNode.is(direction)) return false;
  return direction.sqlFragments.join("").trim().toLowerCase() === "desc";
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

/**
 * Visits the nodes under `value` but not inside nested selects: those have
 * their own shape, so their aggregates do not belong to the outer query.
 */
function walkOuterSelect(
  value: unknown,
  visit: (node: OperationNode) => void,
): void {
  walkNodes(value, (node) => {
    visit(node);
    return !SelectQueryNode.is(node);
  });
}
