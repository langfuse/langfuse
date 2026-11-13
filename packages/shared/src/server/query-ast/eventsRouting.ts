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
 *   e.metadata[k] IN ('a', 'b')        → events_core (each < 200)
 *   if(g, nullIf(e.metadata[k], ''), NULL) = ''
 *                                      → events_core (as its lookup)
 *   if(g, nullIf(e.metadata[k], ''), NULL) is not null
 *   nullIf(e.metadata[k], '') is null  → events_core (empty iff its cut is)
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
 * The emptiness rows are exact: `leftUTF8(v, 200)` is `''` exactly when `v`
 * is (a leading UTF-8 continuation byte is kept too), and a missing key
 * reads `''` on both tables, as `events_core` cuts each `metadata_values`
 * entry in place and keeps `metadata_names` whole.
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
 * Callers that want the truncated copy on purpose read `events_truncated`.
 * It routes to `events_core` unless its WHERE reads a truncated column by a
 * condition the rules above send to `events_full`; then it routes to
 * `events_full`, and each truncated column it reads outside the WHERE is cut
 * as `events_core_mv` cuts it ({@link EVENTS_CORE_TRUNCATIONS}), so it reads
 * the same values on either table:
 *
 *   select e.input … where e.output = 'x'
 *     → select leftUTF8(e.input, 200) as input from events_full as e … where e.output = 'x'
 *
 * Only the select's own WHERE decides; an aggregate's `FILTER (WHERE …)`,
 * HAVING and JOIN ON read cut values. Raw SQL text or identifiers in that
 * WHERE are rejected, as the pass cannot tell what they filter. Once on
 * `events_full`, the relation rejects the reads that cannot be cut: `*`, an
 * unqualified truncated column, raw SQL text or identifiers in a select that
 * reads it. While it stays on `events_core` they read the cut copy and are
 * allowed.
 *
 * Only this pass names the physical tables. A call site that does — as a
 * FROM/JOIN table, an alias, a column qualifier, or in raw SQL — is
 * rejected: ClickHouse resolves a qualifier by table name even when the
 * table is aliased, so a physical name could reach a routed relation.
 */
import {
  AggregateFunctionNode,
  AndNode,
  ExpressionWrapper,
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
  type Expression,
  type KyselyPlugin,
  type OperationNode,
  type OrderByItemNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  ReferenceNode,
  type RootOperationNode,
  type SelectQueryNode,
  type WhereNode,
} from "kysely";

import { filterOperators } from "../../interfaces/filters";
import {
  EVENTS_CORE_TRUNCATION_LIMIT,
  metadataFilterIsEventsCoreSafe,
} from "../queries/clickhouse-sql/events-core-truncation";
import { QueryCompileError } from "./errors";
import { arrayMap, leftUTF8 } from "./extensions";
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
  EVENTS_CORE_TRUNCATIONS,
  LOGICAL_EVENTS_TABLES,
  PHYSICAL_EVENTS_TABLES,
} from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

const LOGICAL_EVENTS = "events";
const LOGICAL_EVENTS_TRUNCATED = "events_truncated";
const PHYSICAL_EVENT_NAME = /\bevents_(core|full)\b/;

export class EventsTableRoutingPlugin implements KyselyPlugin {
  /**
   * `args.node` unchanged when it reads no logical `events` relation.
   * Otherwise the tree with each logical relation on `events_core` or
   * `events_full`, and truncated reads of an `events_truncated` relation on
   * `events_full` cut to the core value. Throws `QueryCompileError` when such
   * a relation also has a read it cannot cut (`*`, an unqualified column, raw
   * SQL).
   */
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
    analysis.rejectUncutReads();
    return new EventsTableRouter(
      analysis.fullRelations,
      analysis.copyReads,
    ).transformNode(tree) as RootOperationNode;
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
  /**
   * `events` relations that read a truncated column, and `events_truncated`
   * relations whose WHERE reads one.
   */
  readonly fullRelations = new Set<OperationNode>();
  /**
   * Truncated-column references to an `events_truncated` relation outside
   * its WHERE, each with that relation: the router cuts them when the
   * relation reads `events_full`.
   */
  readonly copyReads = new Map<OperationNode, OperationNode>();
  /**
   * Reads of `events_truncated` relations the router cannot cut (`*`, an
   * unqualified truncated column, raw SQL), each with the relations it may
   * read.
   */
  private readonly uncutReads: {
    read: string;
    relations: RoutingRelation[];
  }[] = [];
  /** Relations of each enclosing select, innermost last. */
  private readonly scopes: RoutingRelation[][] = [];
  /** Per enclosing select, innermost last: whether the walk is in its WHERE. */
  private readonly inWhere: boolean[] = [];
  /**
   * Per enclosing select, innermost last: its own WHERE, the only one that
   * sets {@link inWhere} (an aggregate's `FILTER (WHERE …)` does not).
   */
  private readonly selectWheres: (WhereNode | undefined)[] = [];
  /**
   * Set while a condition the shortcuts in {@link transformNodeImpl} accept
   * is walked outside a WHERE: its reads of `events` route nothing, and its
   * reads of `events_truncated` are cut like any other read there.
   */
  private walkingCoreSafe = false;
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
   * Outside a WHERE the first three are also walked, as {@link walkingCoreSafe}:
   * there an `events_truncated` relation routed to `events_full` must cut
   * them (`toFloat64OrNull(e.metadata[k]) > 1` parses the cut value).
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
      this.walkCoreSafeOutsideWhere(() =>
        super.transformNodeImpl(node, queryId),
      );
      return node;
    }
    if (isTruncatedEmptinessCheck(node)) {
      rejectPhysicalQualifiers(node);
      this.walkCoreSafeOutsideWhere(() =>
        super.transformNodeImpl(node, queryId),
      );
      return node;
    }
    const comparison = coreSafeMetadataComparison(node);
    if (comparison) {
      // The lookup's columns read no truncated value, but their qualifiers
      // must still not name a physical table.
      rejectPhysicalQualifiers(comparison.lookup.array);
      this.walkCoreSafeOutsideWhere(() =>
        this.transformNode(comparison.lookup.array, queryId),
      );
      this.transformNode(comparison.lookup.index, queryId);
      if (comparison.guard) this.transformNode(comparison.guard, queryId);
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
    this.inWhere.push(false);
    this.selectWheres.push(node.where);
    try {
      return super.transformSelectQuery(node, queryId);
    } finally {
      this.scopes.pop();
      this.inWhere.pop();
      this.selectWheres.pop();
    }
  }

  /**
   * Walks the innermost select's own WHERE with {@link inWhere} set, so a
   * truncated column read there (`e.input like '%x%'`) routes the
   * `events_truncated` relation it reads to `events_full`
   * ({@link readColumn}); the same read in the select list is cut instead.
   *
   * Any other WhereNode (an aggregate's `count() FILTER (WHERE …)`) is
   * walked without it, so its reads are cut like select-list reads.
   *
   * Known gap: HAVING and JOIN ON are not WhereNodes either, so a filter
   * there on `input`, `output` or `metadata_values` of an `events_truncated`
   * relation compares the 200-character events_core cut, never the full
   * value (`having e.input = 'x'` stays on events_core; next to a WHERE
   * that routes to events_full it renders `having leftUTF8(e.input, 200) =
   * …`). The logical `events` relation routes such reads to events_full.
   */
  protected override transformWhere(
    node: WhereNode,
    queryId?: QueryId,
  ): WhereNode {
    if (node !== this.selectWheres.at(-1)) {
      return super.transformWhere(node, queryId);
    }
    const depth = this.inWhere.length - 1;
    this.inWhere[depth] = true;
    try {
      return super.transformWhere(node, queryId);
    } finally {
      this.inWhere[depth] = false;
    }
  }

  /**
   * Throws for a read the router cannot cut, of an `events_truncated`
   * relation that reads `events_full`.
   */
  rejectUncutReads(): void {
    for (const { read, relations } of this.uncutReads) {
      const full = relations.find((r) => this.fullRelations.has(r.node));
      if (full) {
        throw new QueryCompileError(
          `${read} cannot read "${full.name}": its WHERE routes that events_truncated relation to events_full, where only qualified column references are cut to the events_core copy. List and qualify the columns, and use builder expressions instead of raw SQL.`,
        );
      }
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
      if (qualifier === undefined) {
        this.rejectStar("*");
      } else {
        const relation = this.resolveQualified(qualifier);
        if (relation?.logical) throw starError(`${qualifier}.*`);
        if (relation?.truncatedCopy) {
          this.readCopiesUncut(`${qualifier}.*`, [relation]);
        }
      }
    } else {
      this.readColumn(node.column.column.name, qualifier, node);
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

  /**
   * Raw text or identifiers may read any column, so where the read picks the
   * table (any read of `events`, a WHERE read of `events_truncated`) they
   * throw; elsewhere over `events_truncated` they throw only once its WHERE
   * routes it to `events_full`.
   */
  protected override transformRaw(node: RawNode, queryId?: QueryId): RawNode {
    rejectPhysicalRawNames(node);
    const writesText =
      node.sqlFragments.some((fragment) => fragment.trim() !== "") ||
      node.parameters.some((p) => IdentifierNode.is(p) || TableNode.is(p));
    if (writesText && this.readsLogicalInScope()) {
      throw new QueryCompileError(
        `Raw SQL text or identifiers cannot appear in a select that reads the logical "${LOGICAL_EVENTS}" relation: they may read a truncated column the routing pass cannot see. Use builder expressions, sql.ref() or bound values.`,
      );
    }
    if (writesText && this.copiesInScope().length > 0) {
      if (this.inWhere.at(-1)) {
        throw new QueryCompileError(
          `Raw SQL text or identifiers cannot appear in the WHERE of a select that reads "${LOGICAL_EVENTS_TRUNCATED}": they may filter a truncated column, which routes the relation to events_full, and the routing pass cannot see it. Use builder expressions, sql.ref() or bound values.`,
        );
      }
      this.readCopiesUncut("Raw SQL text or identifiers", this.copiesInScope());
    }
    return super.transformRaw(node, queryId);
  }

  /**
   * Records a read of `column` from the relation `qualifier` names, or from
   * the one an unqualified column resolves to; `reference` is the read when
   * it is a column reference.
   */
  private readColumn(
    column: string,
    qualifier: string | undefined,
    reference?: ReferenceNode,
  ): void {
    if (!EVENTS_CORE_TRUNCATED_COLUMNS.has(column)) return;
    const relation =
      qualifier === undefined
        ? this.resolveUnqualified(column)
        : this.resolveQualified(qualifier);
    if (relation?.logical && !this.walkingCoreSafe) {
      this.fullRelations.add(relation.node);
    }
    if (!relation?.truncatedCopy) return;
    if (this.inWhere.at(-1)) this.fullRelations.add(relation.node);
    else if (reference) this.copyReads.set(reference, relation.node);
  }

  private resolveQualified(qualifier: string): RoutingRelation | undefined {
    for (const relations of this.scopes.toReversed()) {
      const match = relations.find((relation) => relation.name === qualifier);
      if (match) return match;
    }
    return undefined;
  }

  /**
   * No relation: routing cannot tell which relation an unqualified truncated
   * `column` reads. Throws while the logical `events` relation is in scope
   * (outside a {@link walkingCoreSafe} walk), or in a WHERE with an
   * `events_truncated` relation in scope. Otherwise records it as an uncut
   * read of every `events_truncated` relation in scope.
   */
  private resolveUnqualified(column: string): RoutingRelation | undefined {
    const copies = this.copiesInScope();
    if (this.readsLogicalInScope() && !this.walkingCoreSafe) {
      throw new QueryCompileError(
        `Qualify "${column}": it is truncated in events_core, so the routing pass needs to know which relation reads it while the logical "${LOGICAL_EVENTS}" relation is in scope.`,
      );
    }
    if (copies.length > 0 && this.inWhere.at(-1)) {
      throw new QueryCompileError(
        `Qualify "${column}" in the WHERE: it is truncated in events_core, so the routing pass needs to know which "${LOGICAL_EVENTS_TRUNCATED}" relation it filters.`,
      );
    }
    this.readCopiesUncut(`Unqualified "${column}"`, copies);
    return undefined;
  }

  /** `events_truncated` relations of the current select and enclosing ones. */
  private copiesInScope(): RoutingRelation[] {
    return this.scopes.flat().filter((relation) => relation.truncatedCopy);
  }

  /** Runs `walk` as {@link walkingCoreSafe} when outside a WHERE, else skips it. */
  private walkCoreSafeOutsideWhere(walk: () => unknown): void {
    if (this.inWhere.at(-1)) return;
    this.walkingCoreSafe = true;
    try {
      walk();
    } finally {
      this.walkingCoreSafe = false;
    }
  }

  private readCopiesUncut(read: string, relations: RoutingRelation[]): void {
    if (relations.length > 0) this.uncutReads.push({ read, relations });
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
    const relations = this.scopes.at(-1) ?? [];
    if (relations.some((relation) => relation.logical)) throw starError(star);
    this.readCopiesUncut(
      star,
      relations.filter((relation) => relation.truncatedCopy),
    );
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
  constructor(
    private readonly fullRelations: ReadonlySet<OperationNode>,
    private readonly copyReads: ReadonlyMap<OperationNode, OperationNode>,
  ) {
    super();
  }

  protected override transformNodeImpl<T extends OperationNode>(
    node: T,
    queryId?: QueryId,
  ): T {
    const cut = this.cutRead(node);
    // A cut column reference becomes a function call wherever it stands.
    return cut ? (cut as T) : super.transformNodeImpl(node, queryId);
  }

  /** A selected cut column keeps its name: `leftUTF8(e.input, 200) as input`. */
  protected override transformSelection(
    node: SelectionNode,
    queryId?: QueryId,
  ): SelectionNode {
    const { selection } = node;
    const cut = this.cutRead(selection);
    if (
      !cut ||
      !ReferenceNode.is(selection) ||
      !ColumnNode.is(selection.column)
    ) {
      return super.transformSelection(node, queryId);
    }
    return SelectionNode.create(
      AliasNode.create(
        cut,
        IdentifierNode.create(selection.column.column.name),
      ),
    );
  }

  /** `node` cut, when it is a read of an `events_truncated` relation routed to `events_full`. */
  private cutRead(node: OperationNode): OperationNode | undefined {
    const relation = this.copyReads.get(node);
    if (relation === undefined || !this.fullRelations.has(relation)) {
      return undefined;
    }
    return ReferenceNode.is(node) && ColumnNode.is(node.column)
      ? cutTruncatedColumn(node, node.column.column.name)
      : undefined;
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
    truncatedCopy: logicalName === LOGICAL_EVENTS_TRUNCATED,
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
const TRUNCATED_TEXT_COLUMNS: ReadonlySet<string> = new Set(
  Object.entries(EVENTS_CORE_TRUNCATIONS)
    .filter(([, { cut }]) => cut === "text")
    .map(([column]) => column),
);

/**
 * `reference` to a truncated column as `events_core` stores it, read on
 * `events_full` ({@link EVENTS_CORE_TRUNCATIONS}):
 *
 *   e.input           → leftUTF8(e.input, 200)
 *   e.metadata_values → arrayMap(v -> leftUTF8(v, 200), e.metadata_values)
 *   e.input_length    → lengthUTF8(leftUTF8(e.input, 200))
 */
function cutTruncatedColumn(
  reference: ReferenceNode,
  column: string,
): OperationNode | undefined {
  if (!Object.hasOwn(EVENTS_CORE_TRUNCATIONS, column)) return undefined;
  const truncation =
    EVENTS_CORE_TRUNCATIONS[column as keyof typeof EVENTS_CORE_TRUNCATIONS];
  /** `text` cut as `events_core` stores it. */
  const cutText = (text: Expression<string>) =>
    leftUTF8(text, EVENTS_CORE_TRUNCATION_LIMIT);
  switch (truncation.cut) {
    case "text":
      return cutText(
        new ExpressionWrapper<never, never, string>(reference),
      ).toOperationNode();
    case "elements":
      return arrayMap(
        cutText,
        new ExpressionWrapper<never, never, string[]>(reference),
      ).toOperationNode();
    case "length":
      return FunctionNode.create("lengthUTF8", [
        cutText(
          new ExpressionWrapper<never, never, string>(
            ReferenceNode.create(
              ColumnNode.create(truncation.of),
              reference.table,
            ),
          ),
        ).toOperationNode(),
      ]);
  }
}

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
  /** The `=` values of an `IN` list ({@link coreSafeInList}). */
  value: string | number | string[];
  /** `g` of a {@link guardedLookup}; walked like any other read. */
  guard?: OperationNode;
};

/** An operator of a numeric (`numberObject`) metadata comparison. */
function isNumericMetadataOperator(
  operator: string,
): operator is (typeof filterOperators.numberObject)[number] {
  return filterOperators.numberObject.some((numeric) => numeric === operator);
}

/**
 * A comparison over a metadata lookup (built by `metadataValue` /
 * `firstMetadataValue`, which set `ArrayIndexNode.metadataLookup`), for a
 * bound `v` that
 * `metadataFilterIsEventsCoreSafe` accepts:
 *
 *   lookup = 's'                      (string `=`)
 *   lookup IN ({p:Array(String)})     (string `=` for each listed value)
 *   startsWith(lookup, 's')           (string `starts with`)
 *   toFloat64OrNull(lookup) <op> 1.5  (numeric `=` `>` `<` `>=` `<=`)
 *
 * `=`, `IN` and `startsWith` also take a {@link guardedLookup} as the
 * looked-up value, and a `''` value is allowed there. `IS [NOT] NULL` takes one, or `nullIf(lookup, '')`
 * ({@link nonEmptyLookup}), as an emptiness check: NULL where `lookup` is
 * `''` (or `g` fails), and a cut entry is `''` exactly where the full one is.
 */
function coreSafeMetadataComparison(
  node: OperationNode,
): CoreSafeComparison | undefined {
  if (BinaryOperationNode.is(node) && OperatorNode.is(node.operator)) {
    const { operator } = node.operator;
    if (operator === "is" || operator === "is not") {
      return metadataEmptinessCheck(node, operator);
    }
    const parsed = parsedMetadataLookup(node.leftOperand);
    if (parsed && isNumericMetadataOperator(operator)) {
      return coreSafe(parsed, operator, node.rightOperand, "number");
    }
    if (operator !== "=" && operator !== "in") return undefined;
    const guarded = guardedLookup(node.leftOperand);
    const lookup = guarded?.lookup ?? node.leftOperand;
    const comparison =
      operator === "="
        ? coreSafe(lookup, "=", node.rightOperand, "string")
        : coreSafeInList(lookup, node.rightOperand);
    return comparison && guarded
      ? { ...comparison, guard: guarded.guard }
      : comparison;
  }
  if (
    FunctionNode.is(node) &&
    node.func === "startsWith" &&
    node.arguments.length === 2
  ) {
    const guarded = guardedLookup(node.arguments[0]);
    const comparison = coreSafe(
      guarded?.lookup ?? node.arguments[0],
      "starts with",
      node.arguments[1],
      "string",
    );
    return comparison && guarded
      ? { ...comparison, guard: guarded.guard }
      : comparison;
  }
  return undefined;
}

/**
 * `lookup` and `g` of `if(g, nullIf(lookup, ''), NULL)`. Compared by `=` or
 * `IN`, it matches where `g` holds and `lookup` is a non-empty listed value,
 * so a `''` value matches no row on either table and every other value
 * routes as on the bare lookup. Under `startsWith(…, v)` it matches where `g`
 * holds and `lookup` is non-empty and starts with `v`: for `v = ''` every
 * non-empty entry, and a cut entry is non-empty exactly where the full one is.
 */
function guardedLookup(
  node: OperationNode,
): { lookup: OperationNode; guard: OperationNode } | undefined {
  if (!FunctionNode.is(node) || node.func !== "if") return undefined;
  if (node.arguments.length !== 3) return undefined;
  const [guard, then, otherwise] = node.arguments;
  if (!isImmediate(otherwise, null)) return undefined;
  const lookup = nonEmptyLookup(then);
  return lookup ? { lookup, guard } : undefined;
}

/** `lookup` of `nullIf(lookup, '')`. */
function nonEmptyLookup(node: OperationNode): OperationNode | undefined {
  if (!FunctionNode.is(node) || node.func !== "nullIf") return undefined;
  if (node.arguments.length !== 2 || !isImmediate(node.arguments[1], "")) {
    return undefined;
  }
  return node.arguments[0];
}

/**
 * `x IS [NOT] NULL` for `x` a {@link guardedLookup} or a
 * {@link nonEmptyLookup} over a metadata lookup built by `metadataValue` /
 * `firstMetadataValue`. A missing key reads
 * `''` on both tables.
 */
function metadataEmptinessCheck(
  node: BinaryOperationNode,
  operator: "is" | "is not",
): CoreSafeComparison | undefined {
  const bound = node.rightOperand;
  if (!ValueNode.is(bound) || bound.value !== null) return undefined;
  const guarded = guardedLookup(node.leftOperand);
  const lookup: { kind: string } | undefined =
    guarded?.lookup ?? nonEmptyLookup(node.leftOperand);
  if (!lookup || !ArrayIndexNode.is(lookup) || !lookup.metadataLookup) {
    return undefined;
  }
  return {
    lookup,
    operator: operator === "is" ? "is null" : "is not null",
    value: "",
    guard: guarded?.guard,
  };
}

/** `node` is `value` inlined as a literal. */
function isImmediate(node: OperationNode, value: "" | null): boolean {
  return ValueNode.is(node) && node.immediate === true && node.value === value;
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
 * `lookup IN ({p:Array(String)})` where every listed string is a core-safe
 * `=` value: the IN matches a row exactly when one of those `=` does.
 */
function coreSafeInList(
  lookup: { kind: string },
  list: OperationNode,
): CoreSafeComparison | undefined {
  if (!ArrayIndexNode.is(lookup) || !lookup.metadataLookup) return undefined;
  const bound = ParensNode.is(list) ? list.node : list;
  if (!ValueNode.is(bound) || !(bound.value instanceof TypedParam)) {
    return undefined;
  }
  const listed: unknown = bound.value.value;
  if (!Array.isArray(listed)) return undefined;
  const values = listed.filter(
    (value): value is string =>
      coreSafeMetadataValue("=", value, "string") !== undefined,
  );
  return values.length === listed.length
    ? { lookup, operator: "=", value: values }
    : undefined;
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
  // Pass 1: the core-safe comparisons. A prefilter can sit before or after
  // its comparison, so all of them must be known before pass 2.
  const comparisons = parts.flatMap((part) => {
    const comparison = coreSafeMetadataComparison(part);
    return comparison ? [comparison] : [];
  });
  // Pass 2: the prefilters among the same conjuncts whose target (operator,
  // value, relation) is one of those comparisons. An unmatched prefilter
  // (its comparison is not core-safe, or not in this AND) is not returned
  // and is walked like any other read.
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
  /** Reads `events_truncated`, so the truncated-column reads of its WHERE pick the table. */
  truncatedCopy: boolean;
  /** Reads `events` or `events_truncated`, so the router replaces it. */
  routed: boolean;
};
