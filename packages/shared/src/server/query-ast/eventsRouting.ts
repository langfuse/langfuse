/**
 * Logical events routing. Runs right after the CTE name check in every
 * compile.
 *
 * Call sites read the logical `events` relation; this pass replaces each
 * FROM/JOIN reference to it with `events_core` or `events_full`, one choice
 * per relation. A relation goes to `events_full` only when a column reference
 * resolves to it and names a column in {@link EVENTS_CORE_TRUNCATED_COLUMNS},
 * outside the metadata predicates `metadataFilterIsEventsCoreSafe` accepts:
 *
 *   e.metadata[k] = 'short'            → events_core (< 200 code points)
 *   startsWith(e.metadata[k], 'p')     → events_core (≤ 200 code points)
 *   toFloat64OrNull(e.metadata[k]) > 1 → events_core (accepted, see below)
 *   e.input != ''                      → events_core (empty iff its cut is)
 *   e.input is not null                → events_core (never NULL)
 *   e.input = 'x', select e.input      → events_full
 *
 * The numeric row is an accepted approximation: a value over 200 code points
 * parses from its cut on `events_core`, so it can match or miss where
 * `events_full` would not. A non-number can parse once cut, and a number can
 * parse to another: `'1'` and 300 zeros is 1e300 whole and 1e199 cut, 250
 * zeros and `'5'` is 5 whole and 0 cut.
 *
 * A qualifier resolves to the innermost FROM/JOIN alias (or unaliased table
 * name) of that name. Shapes that cannot be resolved to one relation are rejected
 * rather than routed to `events_full`, so `events_full` is read only where a
 * query needs it:
 * - `*`, `e.*` or `COLUMNS(…)` over a logical relation (`count(*)` reads no
 *   column);
 * - an unqualified truncated column while a logical relation is in scope,
 *   outside an emptiness check;
 * - raw SQL text or identifiers (`sql` templates, `sql.raw`, `sql.id`,
 *   `sql.table`) in or under a select that reads a logical relation.
 *   `sql.ref` and bound values resolve like builder references.
 *
 * Callers that want the truncated copy on purpose read `events_truncated`,
 * which always routes to `events_core`, whatever columns it reads.
 *
 * Only this pass names the physical tables. A call site that does — as a
 * FROM/JOIN table, an alias, a column qualifier, or in raw SQL — is
 * rejected: ClickHouse resolves a qualifier by table name even when the
 * table is aliased, so a physical name could reach a routed relation.
 */
import {
  AggregateFunctionNode,
  AndNode,
  AliasNode,
  BinaryOperationNode,
  ColumnNode,
  FromNode,
  FunctionNode,
  IdentifierNode,
  JoinNode,
  OperatorNode,
  ParensNode,
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
  ReferenceNode,
  type RootOperationNode,
  type SelectQueryNode,
} from "kysely";

import { filterOperators } from "../../interfaces/filters";
import { metadataFilterIsEventsCoreSafe } from "../queries/clickhouse-sql/events-core-truncation";
import { QueryCompileError } from "./errors";
import {
  ArrayIndexNode,
  FinalTableNode,
  MetadataPrefilterNode,
  TypedParam,
  walkNodes,
} from "./nodes";
import { describeRelation, selectRelations, type Relation } from "./relations";
import {
  EVENTS_CORE_TRUNCATED_COLUMNS,
  LOGICAL_EVENTS_TABLES,
  PHYSICAL_EVENTS_TABLES,
} from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

const LOGICAL_EVENTS = "events";
const PHYSICAL_EVENT_NAME = /\bevents_(core|full)\b/;

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
    return new EventsTableRouter(analysis.fullRelations).transformNode(
      tree,
    ) as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

/**
 * Read-only walk that resolves column references to relations; the
 * transformer is used for its traversal only.
 */
class EventsReadAnalysis extends ClickHouseOperationNodeTransformer {
  readsLogicalEvents = false;
  /** Logical relations that read a truncated column. */
  readonly fullRelations = new Set<OperationNode>();
  /** Relations of each enclosing select, innermost last. */
  private readonly scopes: RoutingRelation[][] = [];
  /**
   * Metadata prefilters whose comparison is a sibling conjunct that stays on
   * `events_core`, so they read no truncated value either. Filled from each
   * AND before its conjuncts are walked.
   */
  private readonly vouchedPrefilters = new Set<OperationNode>();

  /**
   * Where the routing rules for whole conditions apply, before column reads.
   *
   * Input: any node of the tree, in walk order.
   *
   * Output: `node` unchanged; what it reads is recorded in `fullRelations`.
   *
   * Behavior, first match wins:
   * - an AND: vouches for each metadata prefilter whose core-safe comparison
   *   is a sibling conjunct ({@link prefiltersVouchedBy});
   * - a vouched prefilter: read nothing, not walked;
   * - `input`/`output` compared with `''` or NULL
   *   ({@link isTruncatedEmptinessCheck}): reads nothing truncated, not
   *   walked;
   * - a core-safe metadata comparison ({@link coreSafeMetadataComparison}):
   *   only the lookup key is walked;
   * - anything else: walked, so each column reference resolves on its own.
   *
   * Errors: the emptiness check and the metadata comparison still reject a
   * physical table qualifier (a vouched prefilter has its comparison's); the
   * walk throws for an unqualified truncated column, `*` or raw SQL over a
   * logical relation.
   */
  protected override transformNodeImpl<T extends OperationNode>(
    node: T,
    queryId?: QueryId,
  ): T {
    if (AndNode.is(node)) {
      for (const prefilter of prefiltersVouchedBy(node)) {
        this.vouchedPrefilters.add(prefilter);
      }
    }
    if (this.vouchedPrefilters.has(node)) {
      // Built over one relation's `metadata_values` and bound values only
      // (`metadataPrefilter`). Its qualifier is its sibling comparison's,
      // whose walk rejects a physical table name.
      return node;
    }
    if (isTruncatedEmptinessCheck(node)) {
      rejectPhysicalQualifiers(node);
      return node;
    }
    const comparison = coreSafeMetadataComparison(node);
    if (comparison) {
      // The lookup's columns read no truncated value, but their qualifiers
      // must still not name a physical table.
      rejectPhysicalQualifiers(comparison.lookup.array);
      this.transformNode(comparison.lookup.index, queryId);
      return node;
    }
    return super.transformNodeImpl(node, queryId);
  }

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    const described = selectRelations(node);
    described.forEach(rejectPhysicalRelation);
    const relations = described.map(routingRelation);
    if (relations.some((relation) => relation.routed)) {
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
    rejectPhysicalName(qualifier);
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
    rejectPhysicalRawNames(node);
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

function rejectPhysicalName(name: string | undefined): void {
  if (name === undefined || !PHYSICAL_EVENTS_TABLES.has(name)) return;
  throw new QueryCompileError(
    `Read the logical "${LOGICAL_EVENTS}" relation instead of "${name}": the routing pass picks events_core or events_full from the columns read. Read "events_truncated" to get the truncated events_core copy on purpose.`,
  );
}

/** Column qualifiers anywhere under `node`. */
function rejectPhysicalQualifiers(node: OperationNode): void {
  walkNodes(node, (child) => {
    if (ReferenceNode.is(child)) {
      rejectPhysicalName(child.table?.table.identifier.name);
    }
  });
}

/** Raw SQL text, and `sql.table` / `sql.id` parameters. */
function rejectPhysicalRawNames(node: RawNode): void {
  for (const fragment of node.sqlFragments) {
    rejectPhysicalName(PHYSICAL_EVENT_NAME.exec(fragment)?.[0]);
  }
  for (const parameter of node.parameters) {
    rejectPhysicalName(rawParameterName(parameter));
  }
}

/** The name a `sql.table` / `sql.id` parameter writes into raw SQL. */
function rawParameterName(node: OperationNode): string | undefined {
  if (TableNode.is(node)) return node.table.identifier.name;
  if (IdentifierNode.is(node)) return node.name;
  return undefined;
}

/** A physical events table as FROM/JOIN table or alias. */
function rejectPhysicalRelation({ table, alias }: Relation): void {
  rejectPhysicalName(table?.table.identifier.name);
  rejectPhysicalName(alias);
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
   * `events as e` → `events_core as e`. An unaliased relation keeps its
   * logical name as the alias (`events_core as events`), so `events.col`
   * references and the qualifiers later passes add still resolve.
   */
  private routeRelation(node: OperationNode, queryId?: QueryId): OperationNode {
    const table = TableNode.create(
      this.fullRelations.has(node) ? "events_full" : "events_core",
    );
    const { source, alias } = describeRelation(node);
    const logicalName = logicalEventsTableName(source);
    if (logicalName === undefined) {
      return this.transformNode(node, queryId);
    }
    if (FinalTableNode.is(node)) {
      throw new QueryCompileError(
        `FINAL cannot wrap the logical "${logicalName}" relation: events_core and events_full are immutable at read time. Drop the FINAL.`,
      );
    }
    return AliasNode.create(table, IdentifierNode.create(alias ?? logicalName));
  }
}

/**
 * Named by its alias, else by its table name: `events as e` → `e`,
 * `events` → `events`. Schema-qualified names never get here (`ctes.ts`).
 */
function routingRelation({
  node,
  source,
  table,
  alias,
}: Relation): RoutingRelation {
  const logicalName = logicalEventsTableName(source);
  return {
    node,
    name: alias ?? table?.table.identifier.name,
    logical: logicalName === LOGICAL_EVENTS,
    routed: logicalName !== undefined,
  };
}

/** `events` or `events_truncated`, when `node` reads one of them. */
function logicalEventsTableName(node: OperationNode): string | undefined {
  if (!TableNode.is(node)) return undefined;
  const name = node.table.identifier.name;
  return LOGICAL_EVENTS_TABLES.has(name) ? name : undefined;
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

/** String columns `events_core` cuts to their first 200 code points. */
const TRUNCATED_TEXT_COLUMNS: ReadonlySet<string> = new Set([
  "input",
  "output",
]);

/**
 * Whether `node` compares `input` or `output` with `''` by `=`, `!=` or
 * `<>`, either way round, or with NULL by `IS` / `IS NOT`: a cut value is
 * empty exactly when the full one is, and both columns are non-nullable
 * `String`s on either table.
 *
 *   e.input != ''  |  '' = e.output  |  input = ''  |  e.input is not null
 *
 * An unqualified column counts too: an events relation it resolves to
 * answers the check the same on both tables, and a select alias of that
 * name routes by its own expression where it is defined.
 * `input_length = 0` does not count: `lengthUTF8` skips UTF-8 continuation
 * bytes, so a value of 200 of them and then `a` is 1 long but its cut is 0.
 */
function isTruncatedEmptinessCheck(node: OperationNode): boolean {
  if (!BinaryOperationNode.is(node) || !OperatorNode.is(node.operator)) {
    return false;
  }
  const operator = node.operator.operator;
  if (["=", "!=", "<>"].includes(operator)) {
    return (
      comparesWith(node.leftOperand, node.rightOperand, "") ||
      comparesWith(node.rightOperand, node.leftOperand, "")
    );
  }
  if (operator === "is" || operator === "is not") {
    return comparesWith(node.leftOperand, node.rightOperand, null);
  }
  return false;
}

/** `column` is `input` or `output`, and `bound` the value `expected`. */
function comparesWith(
  column: OperationNode,
  bound: OperationNode,
  expected: "" | null,
): boolean {
  if (!ReferenceNode.is(column) || !ColumnNode.is(column.column)) return false;
  if (!TRUNCATED_TEXT_COLUMNS.has(column.column.column.name)) return false;
  if (!ValueNode.is(bound)) return false;
  const value =
    bound.value instanceof TypedParam ? bound.value.value : bound.value;
  return value === expected;
}

/** An operator `metadataFilterIsEventsCoreSafe` classifies. */
type MetadataOperator = Parameters<typeof metadataFilterIsEventsCoreSafe>[0];

/** A metadata comparison that `events_core` answers like `events_full`. */
type CoreSafeComparison = {
  lookup: ArrayIndexNode;
  operator: MetadataOperator;
  value: string | number;
};

/** An operator of a numeric (`numberObject`) metadata comparison. */
function isNumericMetadataOperator(
  operator: string,
): operator is (typeof filterOperators.numberObject)[number] {
  return filterOperators.numberObject.some((numeric) => numeric === operator);
}

/**
 * A comparison over a marked metadata lookup, for a bound `v` that
 * `metadataFilterIsEventsCoreSafe` accepts:
 *
 *   lookup = 's'                      (string `=`)
 *   startsWith(lookup, 's')           (string `starts with`)
 *   toFloat64OrNull(lookup) <op> 1.5  (numeric `=` `>` `<` `>=` `<=`)
 */
function coreSafeMetadataComparison(
  node: OperationNode,
): CoreSafeComparison | undefined {
  if (BinaryOperationNode.is(node) && OperatorNode.is(node.operator)) {
    const { operator } = node.operator;
    const parsed = parsedMetadataLookup(node.leftOperand);
    if (parsed && isNumericMetadataOperator(operator)) {
      return coreSafe(parsed, operator, node.rightOperand, "number");
    }
    if (operator === "=") {
      return coreSafe(node.leftOperand, "=", node.rightOperand, "string");
    }
    return undefined;
  }
  if (
    FunctionNode.is(node) &&
    node.func === "startsWith" &&
    node.arguments.length === 2
  ) {
    return coreSafe(
      node.arguments[0],
      "starts with",
      node.arguments[1],
      "string",
    );
  }
  return undefined;
}

/** `x` of `toFloat64OrNull(x)`; `coreSafe` checks it is a metadata lookup. */
function parsedMetadataLookup(node: OperationNode): OperationNode | undefined {
  return FunctionNode.is(node) && node.func === "toFloat64OrNull"
    ? node.arguments[0]
    : undefined;
}

// `lookup` is typed `{ kind: string }`: `ArrayIndexNode` is outside Kysely's
// closed `OperationNode` union, so narrowing an `OperationNode` yields `never`.
function coreSafe(
  lookup: { kind: string },
  operator: MetadataOperator,
  bound: OperationNode,
  valueType: "string" | "number",
): CoreSafeComparison | undefined {
  if (!ArrayIndexNode.is(lookup) || !lookup.metadataLookup) return undefined;
  if (!ValueNode.is(bound)) return undefined;
  const value = coreSafeMetadataValue(operator, bound.value, valueType);
  return value === undefined ? undefined : { lookup, operator, value };
}

/**
 * The metadata prefilters among `and`'s conjuncts whose
 * comparison (operator and value) is a core-safe sibling conjunct over the
 * same relation's metadata. Such a prefilter holds for every row its
 * sibling matches on either table, so the AND reads the same on both:
 *
 *   has(names, k) AND hasAllTokens(values, …'v'…) AND values[…] = 'v'
 *
 * Conjuncts are the operands of nested ANDs and parentheses.
 */
function prefiltersVouchedBy(and: AndNode): OperationNode[] {
  const parts = conjunctsOf(and);
  const comparisons = parts.flatMap((part) => {
    const comparison = coreSafeMetadataComparison(part);
    return comparison ? [comparison] : [];
  });
  return parts.filter((part) => {
    if (!MetadataPrefilterNode.is(part)) return false;
    const { operator, value } = part.metadataPrefilter;
    const qualifier = metadataValuesQualifier(part);
    return comparisons.some(
      (comparison) =>
        comparison.operator === operator &&
        comparison.value === value &&
        metadataValuesQualifier(comparison.lookup.array) === qualifier,
    );
  });
}

/** `a AND (b AND c)` → `[a, b, c]` */
function conjunctsOf(node: OperationNode): OperationNode[] {
  if (AndNode.is(node)) {
    return [...conjunctsOf(node.left), ...conjunctsOf(node.right)];
  }
  if (ParensNode.is(node)) return conjunctsOf(node.node);
  return [node];
}

/** `q` of the first `q.metadata_values` reference under `node`. */
function metadataValuesQualifier(node: OperationNode): string | undefined {
  let qualifier: string | undefined;
  walkNodes(node, (child) => {
    if (qualifier !== undefined) return false;
    if (
      ReferenceNode.is(child) &&
      ColumnNode.is(child.column) &&
      child.column.column.name === "metadata_values"
    ) {
      qualifier = child.table?.table.identifier.name;
      return false;
    }
  });
  return qualifier;
}

/**
 * The bound value (a {@link TypedParam} unwrapped) if it has `valueType` and
 * `metadataFilterIsEventsCoreSafe` accepts it.
 */
function coreSafeMetadataValue(
  operator: MetadataOperator,
  bound: unknown,
  valueType: "string" | "number",
): string | number | undefined {
  const value = bound instanceof TypedParam ? bound.value : bound;
  return (typeof value === "string" || typeof value === "number") &&
    typeof value === valueType &&
    metadataFilterIsEventsCoreSafe(operator, value)
    ? value
    : undefined;
}

/** A FROM/JOIN source of one select. */
type RoutingRelation = {
  /** The FROM item or join table, as the router meets it. */
  node: OperationNode;
  /** Alias, or the table name of an unaliased table. */
  name?: string;
  /** Reads `events`, so its truncated-column reads pick the table. */
  logical: boolean;
  /** Reads `events` or `events_truncated`, so the router replaces it. */
  routed: boolean;
};
