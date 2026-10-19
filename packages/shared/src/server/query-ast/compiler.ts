import {
  AggregateFunctionNode,
  AliasNode,
  BinaryOperationNode,
  ColumnNode,
  CreateTableNode,
  CreateViewNode,
  DefaultQueryCompiler,
  FunctionNode,
  IdentifierNode,
  InsertQueryNode,
  ParensNode,
  ReferenceNode,
  SelectAllNode,
  SelectQueryNode,
  SetOperationNode,
  TableNode,
  ValueNode,
  type CollateNode,
  type CommonTableExpressionNode,
  type OperationNode,
  type PrimitiveValueListNode,
  type RootOperationNode,
  type ValueListNode,
} from "kysely";
import type { QueryId } from "kysely";
import { TupleParam } from "@clickhouse/client";

import {
  ArrayJoinNode,
  ArrayIndexNode,
  FinalTableNode,
  type ClickHouseSelectQueryNode,
  type LimitByNode,
} from "./nodes";
import { QueryCompileError } from "./errors";
import { TABLE_BIND_TYPES } from "./schema";
import { assertTenancyStamped } from "./tenancy";
import { cteName } from "./transformer";

const ARRAY_JOIN_SQL: Record<ArrayJoinNode["variant"], string> = {
  default: "array join",
  left: "left array join",
  inner: "inner array join",
};

const PLAIN_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const DATE_WRAPPER_FNS = new Set([
  "toDate",
  "toDateTime",
  "toStartOfMinute",
  "toStartOfHour",
  "toStartOfDay",
  "toStartOfMonth",
  "toStartOfYear",
]);

// Interning key for a bound value: equal keys share one placeholder within a
// compile. E.g. `TupleParam(["a", 1])` → `t:["a",1]` and `TupleParam(["b", 2])`
// → `t:["b",2]` bind as two placeholders. Object values need an explicit
// branch, because `String(value)` renders every plain object as
// `[object Object]`.
function canonicalParamValue(value: unknown): string {
  if (value instanceof Date) return `d:${value.toISOString()}`;
  if (value instanceof TupleParam) {
    return `t:${JSON.stringify(value.values)}`;
  }
  if (Array.isArray(value)) {
    return `a:${JSON.stringify(value)}`;
  }
  return `${typeof value}:${String(value)}`;
}

// A Date binds as the `YYYY-MM-DD hh:mm:ss.sss` UTC wall-clock string that
// ingestion writes (`toClickhouseDateTime`). ClickHouse parses both in the
// server timezone, so binds line up with stored rows on any server timezone.
// The string form also covers instants before 1970.
function serializeParamValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString().replace("T", " ").replace("Z", "");
  }
  return value;
}

function inferClickHouseType(value: unknown): string {
  if (value instanceof Date) return "DateTime64(3)";
  if (value instanceof TupleParam) {
    return `Tuple(${value.values.map(inferClickHouseType).join(", ")})`;
  }
  if (Array.isArray(value)) {
    const inner = value.length === 0 ? "String" : inferClickHouseType(value[0]);
    return `Array(${inner})`;
  }
  if (typeof value === "string") return "String";
  if (typeof value === "boolean") return "UInt8";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "Int64" : "Float64";
  }
  if (typeof value === "bigint") return "Int64";
  return "String";
}

/**
 * Column bind types of the relation `table` resolves to: the innermost CTE of
 * that name, else the registry table, else opaque. A schema-qualified table
 * (`default.traces`) is never a CTE.
 */
function relationBindTypes(
  table: TableNode,
  scopes: readonly SelectScope[],
): RelationBindTypes {
  const name = table.table.identifier.name;
  if (!table.table.schema) {
    for (const scope of [...scopes].reverse()) {
      const cte = scope.cte(name);
      if (cte) return cte;
    }
  }
  return (
    TABLE_BIND_TYPES[name] ??
    new OpaqueRelation(
      `"${name}" is not a registered table. Add it to TABLE_REGISTRY in schema.ts, or read the column from a registered table.`,
    )
  );
}

/**
 * Aggregates whose result has the type of their first argument. Others change
 * it (`count`/`uniq` → UInt64, `sum` widens, `avg`/`median` → Float64), so
 * their output falls back like any computed column.
 */
const TYPE_PRESERVING_AGGREGATES = new Set([
  "min",
  "max",
  "any",
  "anyLast",
  "argMin",
  "argMax",
]);

/** The operand whose type `node` keeps: the first argument of a type-preserving aggregate, else `node`. */
function typePreservedOperand(node: OperationNode): OperationNode {
  if (AggregateFunctionNode.is(node) && !node.over) {
    return TYPE_PRESERVING_AGGREGATES.has(node.func) && node.aggregated[0]
      ? node.aggregated[0]
      : node;
  }
  if (FunctionNode.is(node)) {
    return TYPE_PRESERVING_AGGREGATES.has(node.func) && node.arguments[0]
      ? node.arguments[0]
      : node;
  }
  return node;
}

/**
 * Column name and qualifier of a column operand. Kysely parses `"start_time"`
 * to a bare ColumnNode and `"e.start_time"` to a ReferenceNode carrying the
 * table, so only the latter has a qualifier.
 */
function columnReference(
  node: OperationNode,
): { column: string; qualifier: string | undefined } | undefined {
  if (ColumnNode.is(node)) {
    return { column: node.column.name, qualifier: undefined };
  }
  if (ReferenceNode.is(node) && ColumnNode.is(node.column)) {
    return {
      column: node.column.column.name,
      qualifier: node.table?.table.identifier.name,
    };
  }
  return undefined;
}

type SelectScope = {
  /** Bind types of the output columns of the CTE `name` this SELECT's WITH declares, or undefined if it declares none. */
  cte: (name: string) => RelationBindTypes | undefined;
  /** FROM/JOIN names and aliases → the relation's column bind types. */
  relations: Map<string, RelationBindTypes>;
  /**
   * This SELECT's output aliases → the expression each names. ClickHouse
   * resolves an unqualified name to an alias before a relation's column.
   */
  aliases: Map<string, OperationNode>;
};

/**
 * ClickHouse SQL compiler. Identifier quoting is omitted so `clickhouse format`
 * matches the golden snapshots (unquoted identifiers). Parameters are named
 * `{pN:Type}` binds, interned by (type, value) so repeated values collapse to a
 * single placeholder, matching the named `{projectId:String}` style once the
 * golden harness's param normalizer runs.
 *
 * Example — a UNION whose two branches both filter `project_id = 'p'`:
 *
 *     ... WHERE project_id = {p1:String} ... UNION ALL ... WHERE project_id = {p1:String}
 *
 * One `{p1:String}` bind is emitted and reused across both branches, not
 * separate `{p1:String}` / `{p2:String}` bound to the same value.
 *
 * ARRAY JOIN and LIMIT BY ride as extra fields on the select node as real
 * {@link ArrayJoinNode} / {@link LimitByNode} operation nodes.
 */
export class ClickHouseQueryCompiler extends DefaultQueryCompiler {
  namedParameters: Record<string, unknown> = {};
  private intern = new Map<string, string>();
  /**
   * ClickHouse type taken from the compared column (registry bind type) while
   * visiting a binary operation. Falls back to JS-value inference when no
   * column is in scope.
   */
  private pendingBindType: BindType | undefined;
  /**
   * The SELECTs enclosing the node being compiled, innermost last. A column
   * operand looks up its table here to pick its registry bind type.
   */
  private selectScopes: SelectScope[] = [];

  constructor() {
    super();
    // ArrayIndexNode is a custom node kind Kysely's dispatch cannot reach and
    // Kysely has no public hook to register one, so we patch its private
    // visitNode/nodeStack to route the node to visitArrayIndex. Kysely is
    // pinned to 0.28.17 for this; see README.md ("upgrade hazard").
    const parentVisit = this.visitNode.bind(this);
    // Anti-pattern: cast through `unknown` once to reach Kysely's private
    // `visitNode` / `nodeStack` (not part of the public type). Deliberate, to
    // avoid a fork.
    const self = this as unknown as {
      visitNode: (node: OperationNode) => void;
      nodeStack: OperationNode[];
    };
    self.visitNode = (node: OperationNode) => {
      if (ArrayIndexNode.is(node)) {
        self.nodeStack.push(node);
        this.visitArrayIndex(node);
        self.nodeStack.pop();
        return;
      }
      if (FinalTableNode.is(node)) {
        self.nodeStack.push(node);
        this.visitFinalTable(node);
        self.nodeStack.pop();
        return;
      }
      parentVisit(node);
    };
  }

  compileQuery(node: RootOperationNode, queryId: QueryId) {
    this.namedParameters = {};
    this.intern = new Map();
    this.selectScopes = [];
    assertTenancyStamped(node);
    return super.compileQuery(node, queryId);
  }

  /**
   * SQL text of one standalone expression, on a fresh compiler. The caller
   * checks the tree is relation-free. A bind throws: the text is spliced into
   * a query whose parameters this compiler does not own.
   */
  compileExpression(node: OperationNode): string {
    this.visitNode(node);
    if (Object.keys(this.namedParameters).length > 0) {
      throw new QueryCompileError(
        "A standalone expression cannot bind parameters; inline the value or build the whole query on the AST.",
      );
    }
    return this.getSql();
  }

  // Emit identifiers unquoted. `clickhouse format` normalizes to unquoted
  // identifiers, so returning empty wrappers is what keeps raw compiler output
  // byte-comparable with the golden snapshots. (Column/table names in this
  // codebase are plain identifiers, so dropping the quotes is safe here.)
  protected override getLeftIdentifierWrapper(): string {
    return "";
  }

  protected override getRightIdentifierWrapper(): string {
    return "";
  }

  /**
   * Function and aggregate names are written verbatim, so a name that is not
   * a plain identifier would be raw SQL: `fn("tuple(e.input), f")` emits
   * `tuple(e.input), f(…)`.
   */
  protected override visitFunction(node: FunctionNode): void {
    assertPlainName("Function", node.func);
    super.visitFunction(node);
  }

  protected override visitAggregateFunction(node: AggregateFunctionNode): void {
    assertPlainName("Aggregate function", node.func);
    super.visitAggregateFunction(node);
  }

  /**
   * ClickHouse parses only a string literal after `collate`; the name is
   * written verbatim, so no collation compiles to valid SQL.
   */
  protected override visitCollate(node: CollateNode): void {
    throw new QueryCompileError(
      `Collation "${node.collation.name}" is not supported: ClickHouse expects a string literal after collate.`,
    );
  }

  protected override appendValue(parameter: unknown): void {
    this.append(this.bindValue(parameter, this.pendingBindType));
  }

  /**
   * While visiting `column <op> value`, bind the value with the column's
   * registry type so an integer compared to a Float column still emits
   * `{p:Float64}` rather than inferred `{p:Int64}`.
   */
  protected override visitBinaryOperation(node: BinaryOperationNode): void {
    const columnType =
      this.bindTypeOfColumnOperand(node.leftOperand) ??
      this.bindTypeOfColumnOperand(node.rightOperand);
    const previous = this.pendingBindType;
    if (columnType) this.pendingBindType = columnType;
    super.visitBinaryOperation(node);
    this.pendingBindType = previous;
  }

  /**
   * ClickHouse `IN` takes a single `Array(T)` bind, not a parenthesized list of
   * scalar binds. So `col IN (1, 2, 3)` compiles to `col IN ({p:Array(Int64)})`
   * — one array parameter — which is also the shape the existing production SQL
   * (e.g. the scores list query) already relies on. `T` is the compared
   * column's registry type, including when that type is already `Array(...)`.
   */
  protected override visitPrimitiveValueList(
    node: PrimitiveValueListNode,
  ): void {
    const values = [...node.values];
    this.append("(");
    this.append(this.bindValue(values, this.arrayBindType(values)));
    this.append(")");
  }

  protected override visitValueList(node: ValueListNode): void {
    const values = node.values.map((v) =>
      ValueNode.is(v) ? v.value : undefined,
    );
    if (values.every((v) => v !== undefined)) {
      this.append("(");
      this.append(this.bindValue(values, this.arrayBindType(values)));
      this.append(")");
      return;
    }
    super.visitValueList(node);
  }

  private arrayBindType(values: unknown[]): BindType {
    if (typeof this.pendingBindType === "string") {
      return `Array(${this.pendingBindType})`;
    }
    return this.pendingBindType ?? inferClickHouseType(values);
  }

  protected override visitSelectQuery(node: SelectQueryNode): void {
    // A surrounding `column <op> (SELECT …)` must not type this select's
    // own LIMIT / OFFSET / literals with the outer column's bind type, so we
    // clear the pending bind type across the (forked) body and restore it after.
    const previousBindType = this.pendingBindType;
    this.pendingBindType = undefined;
    this.selectScopes.push(this.selectScopeOf(node, this.selectScopes));
    try {
      this.visitSelectQueryBody(node);
    } finally {
      this.selectScopes.pop();
      this.pendingBindType = previousBindType;
    }
  }

  /**
   * What one SELECT makes visible to the columns compiled inside it: the CTEs
   * its WITH declares, each FROM/JOIN name or alias mapped to the column bind
   * types of the relation it reads, and its output aliases.
   */
  private selectScopeOf(
    node: SelectQueryNode,
    enclosing: readonly SelectScope[],
  ): SelectScope {
    const scope: SelectScope = {
      cte: this.cteLookup(node, enclosing),
      relations: new Map(),
      aliases: new Map(),
    };
    for (const { selection } of node.selections ?? []) {
      if (AliasNode.is(selection) && IdentifierNode.is(selection.alias)) {
        scope.aliases.set(selection.alias.name, selection.node);
      }
    }
    const scopes = [...enclosing, scope];
    const relations = [
      ...(node.from?.froms ?? []),
      ...(node.joins ?? []).map((join) => join.table),
    ];
    for (const wrapped of relations) {
      // FINAL wraps the whole relation, alias included: `scores AS s FINAL`.
      const maybeFinal: { kind: string } = wrapped;
      const relation = FinalTableNode.is(maybeFinal)
        ? maybeFinal.table
        : wrapped;
      const aliased = AliasNode.is(relation) ? relation : undefined;
      const inner = aliased ? aliased.node : relation;
      const columns = TableNode.is(inner)
        ? relationBindTypes(inner, scopes)
        : this.outputBindTypes(inner, scopes);
      // A table, aliased or not, is reachable by its name:
      // `FROM traces` and `FROM traces AS t` both register `traces`.
      if (TableNode.is(inner)) {
        scope.relations.set(inner.table.identifier.name, columns);
      }
      // An aliased relation is also reachable by its alias: `FROM traces AS t`
      // registers `t`, and `FROM (SELECT …) AS sub`, which has no name of
      // its own, registers only `sub`.
      if (aliased && IdentifierNode.is(aliased.alias)) {
        scope.relations.set(aliased.alias.name, columns);
      }
    }
    return scope;
  }

  /**
   * Lookup of the CTEs `node`'s WITH declares. A body is typed on its first
   * read, against `enclosing` plus {@link withoutCte}, so it can read an
   * earlier or a later sibling as ClickHouse does.
   *
   * Typing a body recurses into the siblings it reads, and each body is typed
   * without its own name, so the recursion only follows sibling reads. Those
   * never form a cycle: the transformer passes reject
   * `WITH a AS (… FROM b), b AS (… FROM a)` before the compiler runs.
   */
  private cteLookup(
    node: SelectQueryNode,
    enclosing: readonly SelectScope[],
  ): SelectScope["cte"] {
    const bodies = new Map(
      (node.with?.expressions ?? []).map((cte) => [cteName(cte), cte]),
    );
    // `enclosing` may be the compiler's live scope stack; a body typed on a
    // later read must not see the scopes pushed since this SELECT's own.
    const outer = [...enclosing];
    const typed = new Map<string, RelationBindTypes>();
    const lookup = (name: string): RelationBindTypes | undefined => {
      const cte = bodies.get(name);
      if (!cte) return undefined;
      const known = typed.get(name);
      if (known) return known;
      const bodyScope = withoutCte({ cte: lookup }, name);
      const columns = this.outputBindTypes(cte.expression, [
        ...outer,
        bodyScope,
      ]);
      typed.set(name, columns);
      return columns;
    };
    return lookup;
  }

  /**
   * The declaring SELECT's scope declares this CTE, so a body reading its own
   * name would otherwise bind against the CTE instead of the table.
   */
  protected override visitCommonTableExpression(
    node: CommonTableExpressionNode,
  ): void {
    const declaring = this.selectScopes.pop();
    if (!declaring) {
      super.visitCommonTableExpression(node);
      return;
    }
    this.selectScopes.push(withoutCte(declaring, cteName(node)));
    try {
      super.visitCommonTableExpression(node);
    } finally {
      this.selectScopes.pop();
      this.selectScopes.push(declaring);
    }
  }

  /**
   * Bind types of the columns a CTE body or FROM subquery outputs. A selected
   * column keeps the type it has in its source relation, under its alias if it
   * has one, also through a type-preserving aggregate such as `max(col)`.
   * Other computed columns bind by value. A body that is not a select, or
   * whose `*` expands an opaque relation, is opaque.
   */
  private outputBindTypes(
    node: OperationNode,
    enclosing: readonly SelectScope[],
  ): RelationBindTypes {
    if (!SelectQueryNode.is(node)) {
      return new OpaqueRelation(
        "It reads a relation that is neither a table nor a SELECT, so its columns are unknown.",
      );
    }
    const scope = this.selectScopeOf(node, enclosing);
    const scopes = [...enclosing, scope];
    const columns: Record<string, BindType> = {};
    for (const { selection } of node.selections ?? []) {
      // `*`: every column of every relation in this select's FROM/JOIN.
      if (SelectAllNode.is(selection)) {
        for (const relation of scope.relations.values()) {
          if (relation instanceof OpaqueRelation) return relation;
          Object.assign(columns, relation);
        }
        continue;
      }
      // `t.*`: every column of `t`.
      if (ReferenceNode.is(selection) && SelectAllNode.is(selection.column)) {
        const qualifier = selection.table?.table.identifier.name;
        const relation = qualifier ? scope.relations.get(qualifier) : undefined;
        if (relation === undefined) {
          return new OpaqueRelation(
            `It selects ${qualifier}.* but no relation in that select is named "${qualifier}".`,
          );
        }
        if (relation instanceof OpaqueRelation) return relation;
        Object.assign(columns, relation);
        continue;
      }
      const aliased = AliasNode.is(selection) ? selection : undefined;
      const ref = columnReference(
        typePreservedOperand(aliased ? aliased.node : selection),
      );
      const name =
        aliased && IdentifierNode.is(aliased.alias)
          ? aliased.alias.name
          : ref?.column;
      const bindType =
        ref && this.columnBindType(ref.column, ref.qualifier, scopes);
      if (!name) continue;
      if (bindType) columns[name] = bindType;
      else delete columns[name];
    }
    return columns;
  }

  /**
   * Bind type of `column` in `scopes` (innermost last), or undefined to bind
   * by value. An unqualified name that is an output alias of the innermost
   * select takes the type of the column it names, through a type-preserving
   * aggregate; a computed alias binds by value. The aliased expression reads
   * the relations, not the aliases: `max(start_time) AS start_time`.
   */
  private columnBindType(
    column: string,
    qualifier: string | undefined,
    scopes: readonly SelectScope[] = this.selectScopes,
  ): BindType | undefined {
    if (qualifier) return qualifiedBindType(column, qualifier, scopes);
    const scope = scopes.at(-1);
    const aliased = scope?.aliases.get(column);
    if (!aliased) return unqualifiedBindType(column, scope);
    const ref = columnReference(typePreservedOperand(aliased));
    if (!ref) return undefined;
    return ref.qualifier
      ? qualifiedBindType(ref.column, ref.qualifier, scopes)
      : unqualifiedBindType(ref.column, scope);
  }

  /** Bind type of a comparison operand that is a column, or undefined. */
  private bindTypeOfColumnOperand(node: OperationNode): BindType | undefined {
    const ref = columnReference(node);
    if (ref) return this.columnBindType(ref.column, ref.qualifier);
    // Single-argument date wrappers (`toDate(timestamp)`) keep the inner
    // column's bind type. Extra arguments such as a timezone are not column
    // values.
    if (
      FunctionNode.is(node) &&
      DATE_WRAPPER_FNS.has(node.func) &&
      node.arguments.length === 1
    ) {
      return this.bindTypeOfColumnOperand(node.arguments[0]);
    }
    return undefined;
  }

  /**
   * Wholesale copy of Kysely's `DefaultQueryCompiler.visitSelectQuery` (kept in
   * sync with the pinned 0.28.17) with two ClickHouse-only insertions:
   *   - the ARRAY JOIN block, emitted after JOINs and before WHERE (line ~193)
   *   - the LIMIT BY block, emitted before LIMIT (line ~225)
   * Both read extra fields off {@link ClickHouseSelectQueryNode}. Every other
   * clause mirrors the parent verbatim. We override the whole method rather
   * than call `super` because the parent emits clauses in a fixed order and
   * offers no hook to inject a clause between JOIN and WHERE.
   */
  private visitSelectQueryBody(node: SelectQueryNode): void {
    const wrapInParens =
      this.parentNode !== undefined &&
      !ParensNode.is(this.parentNode) &&
      !InsertQueryNode.is(this.parentNode) &&
      !CreateTableNode.is(this.parentNode) &&
      !CreateViewNode.is(this.parentNode) &&
      !SetOperationNode.is(this.parentNode);

    if (this.parentNode === undefined && node.explain) {
      this.visitNode(node.explain);
      this.append(" ");
    }

    if (wrapInParens) {
      this.append("(");
    }

    if (node.with) {
      this.visitNode(node.with);
      this.append(" ");
    }

    this.append("select");

    if (node.distinctOn) {
      this.append(" ");
      this.compileDistinctOn(node.distinctOn);
    }

    if (node.frontModifiers?.length) {
      this.append(" ");
      this.compileList(node.frontModifiers, " ");
    }

    if (node.top) {
      this.append(" ");
      this.visitNode(node.top);
    }

    if (node.selections) {
      this.append(" ");
      this.compileList(node.selections);
    }

    if (node.from) {
      this.append(" ");
      this.visitNode(node.from);
    }

    if (node.joins) {
      this.append(" ");
      this.compileList(node.joins, " ");
    }

    const chNode = node as ClickHouseSelectQueryNode;
    if (chNode.arrayJoins?.length) {
      for (const arrayJoin of chNode.arrayJoins) {
        this.append(" ");
        this.visitArrayJoin(arrayJoin);
      }
    }

    if (node.where) {
      this.append(" ");
      this.visitNode(node.where);
    }

    if (node.groupBy) {
      this.append(" ");
      this.visitNode(node.groupBy);
    }

    if (node.having) {
      this.append(" ");
      this.visitNode(node.having);
    }

    if (node.setOperations) {
      this.append(" ");
      this.compileList(node.setOperations, " ");
    }

    if (node.orderBy) {
      this.append(" ");
      this.visitNode(node.orderBy);
    }

    if (chNode.limitBy) {
      this.append(" ");
      this.visitLimitBy(chNode.limitBy);
    }

    if (node.limit) {
      this.append(" ");
      this.visitNode(node.limit);
    }

    if (node.offset) {
      this.append(" ");
      this.visitNode(node.offset);
    }

    if (node.fetch) {
      this.append(" ");
      this.visitNode(node.fetch);
    }

    if (node.endModifiers?.length) {
      this.append(" ");
      this.compileList(this.sortSelectModifiers([...node.endModifiers]), " ");
    }

    if (wrapInParens) {
      this.append(")");
    }
  }

  private visitArrayIndex(node: ArrayIndexNode): void {
    this.visitNode(node.array);
    this.append("[");
    this.visitNode(node.index);
    this.append("]");
  }

  private visitArrayJoin(node: ArrayJoinNode): void {
    this.append(ARRAY_JOIN_SQL[node.variant]);
    this.append(" ");
    node.items.forEach((item, index) => {
      if (index > 0) this.append(", ");
      this.visitNode(item.expression);
      this.append(" as ");
      this.visitNode(item.alias);
    });
  }

  private visitLimitBy(node: LimitByNode): void {
    this.append("limit ");
    this.visitNode(node.count);
    this.append(" by ");
    this.compileList(node.columns);
  }

  private visitFinalTable(node: FinalTableNode): void {
    this.visitNode(node.table);
    this.append(" final");
  }

  private bindValue(value: unknown, type?: BindType): string {
    if (typeof type === "object") throw new QueryCompileError(type.reason);
    // `type` is the caller-known ClickHouse type; when omitted we infer the
    // widest canonical type from the JS value (Int64 / Float64 / String /
    // DateTime64(3)). Inference only types the bind *placeholder* — ClickHouse
    // still coerces it to the compared column's type — so the widening cases we
    // emit are safe. Pass `type` explicitly where exact width or precision
    // matters (e.g. a Decimal column, where inferred Float64 could round).
    const inferred = type ?? inferClickHouseType(value);
    const key = `${inferred}:${canonicalParamValue(value)}`;
    const existing = this.intern.get(key);
    if (existing) {
      return `{${existing}:${inferred}}`;
    }
    this.addParameter(value);
    const name = `p${this.intern.size + 1}`;
    this.intern.set(key, name);
    this.namedParameters[name] = serializeParamValue(value);
    return `{${name}:${inferred}}`;
  }
}

/**
 * The scope a body of CTE `name` sees in place of its declaring SELECT: every
 * sibling CTE but itself, as ClickHouse resolves `WITH traces AS (SELECT …
 * FROM traces)` to the table, or to an enclosing CTE of that name. The
 * declaring SELECT's FROM relations are not visible to the body.
 */
function withoutCte(
  scope: Pick<SelectScope, "cte">,
  name: string,
): SelectScope {
  return {
    cte: (other) => (other === name ? undefined : scope.cte(other)),
    relations: new Map(),
    aliases: new Map(),
  };
}

function assertPlainName(kind: string, name: string): void {
  if (!PLAIN_IDENTIFIER.test(name)) {
    throw new QueryCompileError(
      `${kind} name "${name}" is not a plain identifier; the compiler writes it verbatim into the SQL.`,
    );
  }
}

/**
 * Bind type of `qualifier.column`, from the innermost select that declares
 * `qualifier`. Unknown when no select declares it or its relation is opaque.
 */
function qualifiedBindType(
  column: string,
  qualifier: string,
  scopes: readonly SelectScope[],
): BindType | undefined {
  for (const scope of [...scopes].reverse()) {
    const relation = scope.relations.get(qualifier);
    if (relation === undefined) continue;
    if (relation instanceof OpaqueRelation) {
      return {
        reason: `Cannot type the value compared to ${qualifier}.${column}: ${relation.reason}`,
      };
    }
    return relation[column];
  }
  return {
    reason: `Cannot type the value compared to ${qualifier}.${column}: no relation in scope is named "${qualifier}". Qualify the column with an alias this query declares.`,
  };
}

/**
 * Bind type of an unqualified `column` in `scope`: the type its relations
 * agree on, or undefined when none has it. Unknown when an opaque relation
 * could provide it, or when relations type it differently (ClickHouse then
 * reads the leftmost one).
 */
function unqualifiedBindType(
  column: string,
  scope: SelectScope | undefined,
): BindType | undefined {
  const relations = [...new Set(scope?.relations.values() ?? [])];
  const opaque = relations.find(
    (columns): columns is OpaqueRelation => columns instanceof OpaqueRelation,
  );
  if (opaque) {
    return {
      reason: `Cannot type the value compared to ${column}: it may come from a relation whose columns are unknown. ${opaque.reason} Qualify the column with the alias of a registered relation.`,
    };
  }
  const known = relations.filter(
    (columns): columns is ColumnBindTypes =>
      !(columns instanceof OpaqueRelation),
  );
  const candidates = [
    ...new Set(
      known.flatMap((columns) =>
        columns[column] === undefined ? [] : [columns[column]],
      ),
    ),
  ];
  // A CTE column read from an opaque relation keeps its unknown type.
  const unknown = candidates.find((bindType) => typeof bindType !== "string");
  if (unknown) return unknown;
  if (candidates.length > 1) {
    return {
      reason: `Cannot type the value compared to ${column}: the joined relations give it different types (${candidates.join(", ")}). Qualify the column with its relation's alias.`,
    };
  }
  return candidates[0];
}

/**
 * A relation whose columns the compiler can't see: a table outside the
 * registry, a relation that is neither a table nor a SELECT, or a subquery or
 * CTE that expands one with `*`. `reason` names the cause for the compile error.
 */
class OpaqueRelation {
  constructor(readonly reason: string) {}
}

/**
 * A compared column whose type the compiler can't determine. Binding a value
 * against it throws `reason`; a comparison that binds nothing still compiles.
 */
type UnknownBindType = { reason: string };

/** ClickHouse bind type of a column, or why the compiler can't name one. */
type BindType = string | UnknownBindType;

/** Bind type per column name of one relation. */
type ColumnBindTypes = Readonly<Record<string, BindType>>;

/**
 * A relation's column bind types, or an {@link OpaqueRelation} when the
 * compiler can't see its columns.
 */
type RelationBindTypes = ColumnBindTypes | OpaqueRelation;
