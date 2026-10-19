/**
 * Logical `events` routing. Runs first in every compile.
 *
 * Call sites read the logical `events` relation; this pass replaces each
 * FROM/JOIN reference to it with `events_core` or `events_full`, one choice
 * per relation. A relation goes to `events_full` only when a column reference
 * resolves to it and names a column in {@link EVENTS_CORE_TRUNCATED_COLUMNS},
 * outside the metadata predicates `metadataFilterIsEventsCoreSafe` accepts:
 *
 *   metadataValue(e, k) = 'short'        → events_core (< 200 code points)
 *   startsWith(metadataValue(e, k), 'p') → events_core (≤ 200 code points)
 *   e.input = 'x', select e.input        → events_full
 *
 * A qualifier resolves to the innermost FROM/JOIN alias (or unaliased table
 * name) of that name. Shapes that cannot be resolved to one relation are rejected
 * rather than routed to `events_full`, so `events_full` is read only where a
 * query needs it:
 * - `*`, `e.*` or `COLUMNS(…)` over a logical relation (`count(*)` reads no
 *   column);
 * - an unqualified truncated column while a logical relation is in scope;
 * - a column qualified by `events_core` / `events_full` that names no
 *   relation in scope: ClickHouse resolves a qualifier by table name even
 *   when the table is aliased, so it would reach the routed relation;
 * - raw SQL text or identifiers (`sql` templates, `sql.raw`, `sql.id`,
 *   `sql.table`) in or under a select that reads a logical relation.
 *   `sql.ref` and bound values resolve like builder references.
 *
 * Callers that want the truncated copy on purpose name `events_core`;
 * physical `events_core` / `events_full` references pass through unchanged.
 */
import {
  AggregateFunctionNode,
  AliasNode,
  BinaryOperationNode,
  ColumnNode,
  CommonTableExpressionNode,
  FromNode,
  FunctionNode,
  IdentifierNode,
  JoinNode,
  OperatorNode,
  RawNode,
  SelectAllNode,
  SelectionNode,
  TableNode,
  ValueNode,
  type KyselyPlugin,
  type OperationNode,
  type OrderByItemNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  type ReferenceNode,
  type RootOperationNode,
  type SelectQueryNode,
} from "kysely";

import { metadataFilterIsEventsCoreSafe } from "../queries/clickhouse-sql/events-core-truncation";
import { QueryCompileError } from "./errors";
import { ArrayIndexNode, FinalTableNode } from "./nodes";
import { describeRelation, selectRelations, type Relation } from "./relations";
import { EVENTS_CORE_TRUNCATED_COLUMNS } from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

const LOGICAL_EVENTS = "events";
const PHYSICAL_EVENTS = new Set(["events_core", "events_full"]);

export class EventsTableRoutingPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    // Builders share unchanged child nodes, so one relation node can sit at
    // two places in the tree. A plain transform rebuilds every node, giving
    // each place its own node to key routing on.
    const tree = new ClickHouseOperationNodeTransformer().transformNode(
      args.node,
    );
    const analysis = new EventsReadAnalysis();
    analysis.transformNode(tree);
    if (!analysis.readsLogicalEvents) return args.node;
    rejectPhysicalEventsCte(analysis);
    return new EventsTableRouter(analysis.fullRelations).transformNode(
      tree,
    ) as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

function rejectPhysicalEventsCte(analysis: EventsReadAnalysis): void {
  if (analysis.physicalEventsCte) {
    throw new QueryCompileError(
      `A CTE named "${analysis.physicalEventsCte}" would capture the routed logical "${LOGICAL_EVENTS}" relation; rename the CTE.`,
    );
  }
}

/**
 * Read-only walk that resolves column references to relations; the
 * transformer is used for its traversal only.
 */
class EventsReadAnalysis extends ClickHouseOperationNodeTransformer {
  readsLogicalEvents = false;
  /** Name of a CTE that shadows `events_core` / `events_full`. */
  physicalEventsCte: string | undefined;
  /** Logical relations that read a truncated column. */
  readonly fullRelations = new Set<OperationNode>();
  /** Relations of each enclosing select, innermost last. */
  private readonly scopes: RoutingRelation[][] = [];

  protected override transformNodeImpl<T extends OperationNode>(
    node: T,
    queryId?: QueryId,
  ): T {
    const lookup = coreSafeMetadataLookup(node);
    if (lookup) {
      this.transformNode(lookup.index, queryId);
      return node;
    }
    if (CommonTableExpressionNode.is(node)) this.checkCteName(node);
    return super.transformNodeImpl(node, queryId);
  }

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    const relations = selectRelations(node).map(routingRelation);
    if (relations.some((relation) => relation.logical)) {
      this.readsLogicalEvents = true;
    }
    this.scopes.push(relations);
    try {
      return super.transformSelectQuery(node, queryId);
    } finally {
      this.scopes.pop();
    }
  }

  protected override transformReference(
    node: ReferenceNode,
    _queryId?: QueryId,
  ): ReferenceNode {
    const qualifier = node.table?.table.identifier.name;
    // `sql.ref("e.*")` parses the star as a column named `*`.
    if (SelectAllNode.is(node.column) || node.column.column.name === "*") {
      if (qualifier === undefined) this.rejectStar("*");
      else if (this.resolveQualified(qualifier)?.logical) {
        throw starError(`${qualifier}.*`);
      }
    } else {
      this.readColumn(node.column.column.name, qualifier);
    }
    return node;
  }

  /** Reached only outside a reference: `selectAll()`, `*` in raw SQL. */
  protected override transformSelectAll(node: SelectAllNode): SelectAllNode {
    this.rejectStar("*");
    return node;
  }

  /** Reached only outside a reference. */
  protected override transformColumn(node: ColumnNode): ColumnNode {
    if (node.column.name === "*") this.rejectStar("*");
    else this.readColumn(node.column.name, undefined);
    return node;
  }

  /**
   * Rejects `columns` like any function ({@link rejectColumnsMatcher}). `count(*)`
   * reads no column; its clauses are walked as usual.
   */
  protected override transformAggregateFunction(
    node: AggregateFunctionNode,
    queryId?: QueryId,
  ): AggregateFunctionNode {
    this.rejectColumnsMatcher(node.func);
    if (isCountStar(node)) {
      super.transformAggregateFunction({ ...node, aggregated: [] }, queryId);
      return node;
    }
    return super.transformAggregateFunction(node, queryId);
  }

  /**
   * The direction is raw `asc` / `desc`, so it is not walked: the
   * `no-deprecated` lint rule keeps `orderBy` from taking an expression.
   */
  protected override transformOrderByItem(
    node: OrderByItemNode,
    queryId?: QueryId,
  ): OrderByItemNode {
    this.transformNode(node.orderBy, queryId);
    return node;
  }

  protected override transformFunction(
    node: FunctionNode,
    queryId?: QueryId,
  ): FunctionNode {
    this.rejectColumnsMatcher(node.func);
    return super.transformFunction(node, queryId);
  }

  protected override transformRaw(node: RawNode, queryId?: QueryId): RawNode {
    if (
      this.readsLogicalInScope() &&
      (node.sqlFragments.some((fragment) => fragment.trim() !== "") ||
        node.parameters.some((p) => IdentifierNode.is(p) || TableNode.is(p)))
    ) {
      throw new QueryCompileError(
        `Raw SQL text or identifiers cannot appear in a select that reads the logical "${LOGICAL_EVENTS}" relation: they may read a truncated column the routing pass cannot see. Use builder expressions, sql.ref() or bound values.`,
      );
    }
    return super.transformRaw(node, queryId);
  }

  private readColumn(column: string, qualifier: string | undefined): void {
    if (!EVENTS_CORE_TRUNCATED_COLUMNS.has(column)) return;
    const relation =
      qualifier === undefined
        ? this.resolveUnqualified(column)
        : this.resolveQualified(qualifier);
    if (relation?.logical) this.fullRelations.add(relation.node);
  }

  private resolveQualified(qualifier: string): RoutingRelation | undefined {
    for (const relations of this.scopes.toReversed()) {
      const match = relations.find((relation) => relation.name === qualifier);
      if (match) return match;
    }
    if (PHYSICAL_EVENTS.has(qualifier) && this.readsLogicalInScope()) {
      throw new QueryCompileError(
        `Qualify by the relation's alias, not "${qualifier}": ClickHouse also resolves a table name to an aliased relation, so it may reach the logical "${LOGICAL_EVENTS}" relation after routing.`,
      );
    }
    return undefined;
  }

  private resolveUnqualified(column: string): RoutingRelation | undefined {
    if (this.readsLogicalInScope()) {
      throw new QueryCompileError(
        `Qualify "${column}": it is truncated in events_core, so the routing pass needs to know which relation reads it while the logical "${LOGICAL_EVENTS}" relation is in scope.`,
      );
    }
    return undefined;
  }

  private checkCteName(node: CommonTableExpressionNode): void {
    const name = node.name.table.table.identifier.name;
    if (name === LOGICAL_EVENTS) {
      throw new QueryCompileError(
        `A CTE cannot be named "${LOGICAL_EVENTS}": the name is the logical events relation.`,
      );
    }
    if (PHYSICAL_EVENTS.has(name)) this.physicalEventsCte = name;
  }

  /** `columns(…)` expands like `*`. */
  private rejectColumnsMatcher(func: string): void {
    if (func.toLowerCase() === "columns") this.rejectStar(`${func}(…)`);
  }

  /** Whether the current select or an enclosing one reads a logical relation. */
  private readsLogicalInScope(): boolean {
    return this.scopes.some((relations) => relations.some((r) => r.logical));
  }

  private rejectStar(star: string): void {
    if (this.scopes.at(-1)?.some((relation) => relation.logical)) {
      throw starError(star);
    }
  }
}

function starError(star: string): QueryCompileError {
  return new QueryCompileError(
    `${star} cannot expand the logical "${LOGICAL_EVENTS}" relation: list the columns, so the routing pass can tell whether it reads a truncated one.`,
  );
}

class EventsTableRouter extends ClickHouseOperationNodeTransformer {
  constructor(private readonly fullRelations: ReadonlySet<OperationNode>) {
    super();
  }

  protected override transformFrom(
    node: FromNode,
    queryId?: QueryId,
  ): FromNode {
    return FromNode.create(
      node.froms.map((from) => this.routeRelation(from, queryId)),
    );
  }

  protected override transformJoin(
    node: JoinNode,
    queryId?: QueryId,
  ): JoinNode {
    return {
      ...super.transformJoin(node, queryId),
      table: this.routeRelation(node.table, queryId),
    };
  }

  /**
   * `events as e` → `events_core as e`. An unaliased `events` keeps its name
   * as the alias (`events_core as events`), so `events.col` references and
   * the qualifiers later passes add still resolve.
   */
  private routeRelation(node: OperationNode, queryId?: QueryId): OperationNode {
    const table = TableNode.create(
      this.fullRelations.has(node) ? "events_full" : "events_core",
    );
    const { source, alias } = describeRelation(node);
    if (!isLogicalEventsTable(source)) {
      return this.transformNode(node, queryId);
    }
    if (FinalTableNode.is(node)) {
      throw new QueryCompileError(
        `FINAL cannot wrap the logical "${LOGICAL_EVENTS}" relation: events_core and events_full are immutable at read time. Drop the FINAL.`,
      );
    }
    return AliasNode.create(
      table,
      IdentifierNode.create(alias ?? LOGICAL_EVENTS),
    );
  }
}

/**
 * Named by its alias, else by its table name unless schema-qualified:
 * `events as e` → `e`, `events` → `events`, `default.events_core` → none.
 */
function routingRelation({
  node,
  source,
  table,
  alias,
}: Relation): RoutingRelation {
  return {
    node,
    name:
      alias ??
      (table && !table.table.schema ? table.table.identifier.name : undefined),
    logical: isLogicalEventsTable(source),
  };
}

function isLogicalEventsTable(node: OperationNode): boolean {
  return (
    TableNode.is(node) &&
    node.table.schema === undefined &&
    node.table.identifier.name === LOGICAL_EVENTS
  );
}

/** `count(*)` with any `distinct`, `filter`, `over`, … clause. */
function isCountStar(node: AggregateFunctionNode): boolean {
  if (node.func !== "count" || node.aggregated.length !== 1) return false;
  const [arg] = node.aggregated;
  return (
    SelectAllNode.is(arg) ||
    (SelectionNode.is(arg) && SelectAllNode.is(arg.selection))
  );
}

/**
 * The metadata lookup of `metadataValue(e, k) = v` or
 * `startsWith(metadataValue(e, k), v)`, for a bound `v` that
 * `metadataFilterIsEventsCoreSafe` accepts.
 */
function coreSafeMetadataLookup(
  node: OperationNode,
): ArrayIndexNode | undefined {
  if (
    BinaryOperationNode.is(node) &&
    OperatorNode.is(node.operator) &&
    node.operator.operator === "="
  ) {
    return coreSafe(node.leftOperand, "=", node.rightOperand);
  }
  if (
    FunctionNode.is(node) &&
    node.func === "startsWith" &&
    node.arguments.length === 2
  ) {
    return coreSafe(node.arguments[0], "starts with", node.arguments[1]);
  }
  return undefined;
}

// `lookup` is typed `{ kind: string }`: `ArrayIndexNode` is outside Kysely's
// closed `OperationNode` union, so narrowing an `OperationNode` yields `never`.
function coreSafe(
  lookup: { kind: string },
  operator: "=" | "starts with",
  value: OperationNode,
): ArrayIndexNode | undefined {
  return ArrayIndexNode.is(lookup) &&
    lookup.metadataLookup &&
    ValueNode.is(value) &&
    metadataFilterIsEventsCoreSafe(operator, value.value)
    ? lookup
    : undefined;
}

/** A FROM/JOIN source of one select. */
type RoutingRelation = {
  /** The FROM item or join table, as the router meets it. */
  node: OperationNode;
  /** Alias, or the table name of an unaliased table. */
  name?: string;
  logical: boolean;
};
