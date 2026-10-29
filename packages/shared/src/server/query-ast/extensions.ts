/**
 * ClickHouse-specific query-builder extensions for the Kysely dialect.
 *
 * Kysely has no native representation for several ClickHouse constructs, so
 * this file supplies them in three forms:
 *   - Plugins ({@link ArrayJoinPlugin}, {@link LimitByPlugin}) that attach a
 *     custom operation node (`ArrayJoinNode` / `LimitByNode`) onto the select
 *     node during query transformation; the ClickHouse compiler renders them.
 *   - `$call` helpers ({@link arrayJoin}, {@link limitBy}, {@link useFinal},
 *     {@link includeDeleted})
 *     that apply those plugins while extending the builder's output row type,
 *     so produced aliases are type-checked and misspelled references are
 *     compile errors.
 *   - Typed expression helpers ({@link mapKeys}, {@link metadataValue},
 *     {@link medianExact}, …) that build ClickHouse aggregates, map/array
 *     function calls and `metadata[key]` subscripts as real, parameter-bound
 *     nodes — never raw SQL strings — so they escape and compose like any other
 *     expression.
 */
import type { TupleParam } from "@clickhouse/client";
import {
  AggregateFunctionNode,
  BinaryOperationNode,
  ColumnNode,
  ExpressionWrapper,
  expressionBuilder,
  FromNode,
  FunctionNode,
  IdentifierNode,
  JoinNode,
  OperatorNode,
  ReferenceNode,
  TableNode,
  ValueNode,
  type Expression,
  type ExpressionBuilder,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
  type SelectQueryBuilder,
  type SqlBool,
} from "kysely";

import {
  ArrayIndexNode,
  ArrayJoinNode,
  FinalTableNode,
  LimitByNode,
  finalTable,
  type ArrayJoinVariant,
  type ClickHouseSelectQueryNode,
} from "./nodes";
import { QueryCompileError } from "./errors";
import { describeRelation } from "./relations";
import { DEDUP_SPECS, type ClickHouseDatabase } from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

type OperationNodeSource = OperationNode | { toOperationNode(): OperationNode };

function toNode(source: OperationNodeSource): OperationNode {
  if (
    "toOperationNode" in source &&
    typeof source.toOperationNode === "function"
  ) {
    return source.toOperationNode();
  }
  return source as OperationNode;
}

type ArrayJoinItem = {
  expression: OperationNodeSource;
  as: string;
};

/** Plugin that attaches an {@link ArrayJoinNode} onto the select node. */
class ArrayJoinPlugin implements KyselyPlugin {
  constructor(
    private readonly items: ReadonlyArray<ArrayJoinItem>,
    private readonly variant: ArrayJoinVariant = "default",
  ) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (args.node.kind !== "SelectQueryNode") return args.node;
    const transformer = new ClickHouseOperationNodeTransformer();
    const node = transformer.transformNode(
      args.node,
    ) as ClickHouseSelectQueryNode;
    const arrayJoinNode = ArrayJoinNode.create(
      this.items.map((item) => ({
        expression: toNode(item.expression),
        alias: IdentifierNode.create(item.as),
      })),
      this.variant,
    );
    return {
      ...node,
      arrayJoins: [...(node.arrayJoins ?? []), arrayJoinNode],
    } as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

type LimitBySpec<DB, TB extends keyof DB> = {
  count: number;
  columns: (
    eb: ExpressionBuilder<DB, TB>,
  ) => ReadonlyArray<Expression<unknown>>;
};

/** Plugin that attaches a {@link LimitByNode} onto the select node. */
class LimitByPlugin implements KyselyPlugin {
  constructor(
    private readonly count: number,
    private readonly columns: ReadonlyArray<Expression<unknown>>,
  ) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (args.node.kind !== "SelectQueryNode") return args.node;
    const transformer = new ClickHouseOperationNodeTransformer();
    const node = transformer.transformNode(
      args.node,
    ) as ClickHouseSelectQueryNode;
    return {
      ...node,
      limitBy: LimitByNode.create(
        ValueNode.createImmediate(this.count),
        this.columns.map(toNode),
      ),
    } as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

// Build a `table.column` reference straight from its parts. Prefer this
// whenever the caller already holds the table and column separately.
function qualifiedColumn(table: string, column: string): OperationNode {
  return ReferenceNode.create(
    ColumnNode.create(column),
    TableNode.create(table),
  );
}

/** ClickHouse `mapKeys(map)`. */
export function mapKeys(
  map: Expression<Record<string, unknown>>,
): ChExpression<string[]> {
  return functionCall("mapKeys", [map]);
}

/** ClickHouse `mapValues(map)`. */
export function mapValues<V>(
  map: Expression<Record<string, V>>,
): ChExpression<V[]> {
  return functionCall("mapValues", [map]);
}

/** ClickHouse `uniq(value)`, an approximate distinct count. */
export function uniq(value: Expression<unknown>): ChExpression<number> {
  return aggregate("uniq", [value]);
}

/** ClickHouse `count()`. Kysely's `eb.fn.countAll()` renders `count(*)`. */
export function count(): ExpressionWrapper<
  ClickHouseDatabase,
  keyof ClickHouseDatabase,
  number
> {
  return new ExpressionWrapper(
    AggregateFunctionNode.create("count", []) as unknown as OperationNode,
  );
}

/** ClickHouse `medianExact(expression)`. */
export function medianExact(
  expression: Expression<unknown>,
): ExpressionWrapper<ClickHouseDatabase, keyof ClickHouseDatabase, number> {
  return new ExpressionWrapper(
    AggregateFunctionNode.create("medianExact", [
      expression.toOperationNode(),
    ]) as unknown as OperationNode,
  );
}

type DateDiffUnit = "millisecond" | "second" | "minute" | "hour" | "day";

/** ClickHouse `dateDiff(unit, start, end)`. */
export function dateDiff(
  unit: DateDiffUnit,
  start: Expression<unknown>,
  end: Expression<unknown>,
): ChExpression<number> {
  return new ExpressionWrapper<
    ClickHouseDatabase,
    keyof ClickHouseDatabase,
    number
  >(
    // ClickHouse requires the unit to be a constant, so it is inlined rather
    // than bound. `DateDiffUnit` keeps it to known keywords.
    FunctionNode.create("dateDiff", [
      ValueNode.createImmediate(unit),
      start.toOperationNode(),
      end.toOperationNode(),
    ]) as unknown as OperationNode,
  );
}

/**
 * `map[key]` subscript. A string key is bound; pass `literal(...)` for a code
 * constant so it is inlined.
 */
export function mapValue<V = number>(
  map: Expression<Record<string, V>>,
  key: string | Expression<string>,
): ChExpression<V> {
  return subscript(map, key, false);
}

function subscript<V>(
  map: Expression<Record<string, V>>,
  key: string | Expression<string>,
  metadataLookup: boolean,
): ChExpression<V> {
  return new ExpressionWrapper<ClickHouseDatabase, keyof ClickHouseDatabase, V>(
    ArrayIndexNode.create(
      map.toOperationNode(),
      typeof key === "string" ? ValueNode.create(key) : key.toOperationNode(),
      metadataLookup,
    ) as unknown as OperationNode,
  );
}

/**
 * Sum of the map values whose key contains `needle`, case-insensitively:
 * `arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, needle) > 0, map)))`.
 * The lambda is built as a `->` binary operation; Kysely has no lambda node.
 * Pass a code constant as `literal(...)` so it is inlined.
 */
export function sumMapValuesWhereKeyContains(
  map: Expression<Record<string, unknown>>,
  needle: Expression<string>,
): ChExpression<number> {
  const keyMatches = BinaryOperationNode.create(
    FunctionNode.create("positionCaseInsensitive", [
      qualifiedColumn("x", "1"),
      needle.toOperationNode(),
    ]),
    OperatorNode.create(">"),
    ValueNode.createImmediate(0),
  );
  const lambda = BinaryOperationNode.create(
    ColumnNode.create("x"),
    OperatorNode.create("->"),
    keyMatches,
  );
  return new ExpressionWrapper<
    ClickHouseDatabase,
    keyof ClickHouseDatabase,
    number
  >(
    FunctionNode.create("arraySum", [
      FunctionNode.create("mapValues", [
        FunctionNode.create("mapFilter", [lambda, map.toOperationNode()]),
      ]),
    ]) as unknown as OperationNode,
  );
}

/**
 * A helper's result. Its table scope is every table: Kysely doesn't check an
 * expression's scope where it is used (`ExpressionWrapper<DB, "e", T>` is
 * assignable to `ExpressionWrapper<DB, "t", T>`), so a narrower type would
 * catch nothing. Scope is checked where references are written, so shared
 * expressions take the calling query's `eb` (README, "Using it").
 */
type ChExpression<T> = ExpressionWrapper<
  ClickHouseDatabase,
  keyof ClickHouseDatabase,
  T
>;

function functionCall<T>(
  fn: string,
  args: ReadonlyArray<OperationNodeSource>,
): ChExpression<T> {
  return new ExpressionWrapper(
    FunctionNode.create(fn, args.map(toNode)) as unknown as OperationNode,
  );
}

function aggregate<T>(
  fn: string,
  args: ReadonlyArray<OperationNodeSource>,
): ChExpression<T> {
  return new ExpressionWrapper(
    AggregateFunctionNode.create(
      fn,
      args.map(toNode),
    ) as unknown as OperationNode,
  );
}

/**
 * A constant inlined into the SQL text rather than bound, so code-defined
 * constants (`level = 'ERROR'`, `span_id != ''`) render as literals. Never
 * pass user input; bind it instead.
 */
export function literal<T extends string | number | boolean | null>(
  value: T,
): ChExpression<T> {
  // Kysely doubles single quotes but leaves backslashes, which ClickHouse
  // reads as escapes.
  if (typeof value === "string" && value.includes("\\")) {
    throw new QueryCompileError(
      `literal does not accept backslashes, got ${value}.`,
    );
  }
  return new ExpressionWrapper(
    ValueNode.createImmediate(value) as unknown as OperationNode,
  );
}

/** ClickHouse `if(condition, then, otherwise)`. */
export function ifElse<A, B>(
  condition: Expression<SqlBool>,
  then: Expression<A>,
  otherwise: Expression<B>,
): ChExpression<A | B> {
  return functionCall("if", [condition, then, otherwise]);
}

/** ClickHouse `multiIf(c1, v1, c2, v2, …, otherwise)`. */
export function multiIf<T>(
  branches: ReadonlyArray<readonly [Expression<SqlBool>, Expression<T>]>,
  otherwise: Expression<T>,
): ChExpression<T> {
  return functionCall("multiIf", [...branches.flat(), otherwise]);
}

/** ClickHouse `nullIf(value, other)`. */
export function nullIf<T>(
  value: Expression<T>,
  other: Expression<T>,
): ChExpression<T | null> {
  return functionCall("nullIf", [value, other]);
}

/** ClickHouse `ifNull(value, fallback)`. */
export function ifNull<T>(
  value: Expression<T | null>,
  fallback: Expression<T>,
): ChExpression<T> {
  return functionCall("ifNull", [value, fallback]);
}

/** ClickHouse `toBool(value)`. */
export function toBool(value: Expression<SqlBool>): ChExpression<boolean> {
  return functionCall("toBool", [value]);
}

/** ClickHouse `isNull(value)`. */
export function isNull(value: Expression<unknown>): ChExpression<SqlBool> {
  return functionCall("isNull", [value]);
}

/** ClickHouse `greatest(a, b, …)`. */
export function greatest<T>(...values: Expression<T>[]): ChExpression<T> {
  return functionCall("greatest", values);
}

/** ClickHouse `concat(a, b, …)`. */
export function concat(...values: Expression<string>[]): ChExpression<string> {
  return functionCall("concat", values);
}

/**
 * ClickHouse `startsWith(haystack, prefix)`. A string prefix is bound; pass
 * `literal(...)` for a code constant so it is inlined.
 */
export function startsWith(
  haystack: Expression<string>,
  prefix: string | Expression<string>,
): ChExpression<SqlBool> {
  return functionCall("startsWith", [
    haystack,
    typeof prefix === "string" ? ValueNode.create(prefix) : prefix,
  ]);
}

/** ClickHouse `length(array)`. */
export function arrayLength(
  array: Expression<unknown[]>,
): ChExpression<number> {
  return functionCall("length", [array]);
}

/** ClickHouse `arraySort(array)`: the elements in ascending order. */
export function arraySort<T>(array: Expression<T[]>): ChExpression<T[]> {
  return functionCall("arraySort", [array]);
}

/** ClickHouse `notEmpty(array)`. */
export function notEmpty(array: Expression<unknown[]>): ChExpression<SqlBool> {
  return functionCall("notEmpty", [array]);
}

/**
 * ClickHouse `arrayExists(x -> predicate, array)`. `predicate` receives the
 * lambda parameter: `x` at the top level, `x1`, `x2`, … inside nested lambdas.
 */
export function arrayExists<T>(
  predicate: (element: Expression<T>) => Expression<SqlBool>,
  array: Expression<T[]>,
): ChExpression<SqlBool> {
  return functionCall("arrayExists", [lambda("x", predicate), array]);
}

/** ClickHouse `any(value)`: some value of the group. */
export function anyValue<T>(value: Expression<T>): ChExpression<T> {
  return aggregate("any", [value]);
}

/** ClickHouse `anyIf(value, condition)`: some value among the matching rows. */
export function anyIf<T>(
  value: Expression<T>,
  condition: Expression<SqlBool>,
): ChExpression<T> {
  return aggregate("anyIf", [value, condition]);
}

/** ClickHouse `argMax(value, by)`: `value` of the row with the largest `by`. */
export function argMax<T>(
  value: Expression<T>,
  by: Expression<unknown>,
): ChExpression<T> {
  return aggregate("argMax", [value, by]);
}

/** ClickHouse `countIf(condition)`. */
export function countIf(condition: Expression<SqlBool>): ChExpression<number> {
  return aggregate("countIf", [condition]);
}

/** ClickHouse `uniqIf(value, condition)`, an approximate distinct count. */
export function uniqIf(
  value: Expression<unknown>,
  condition: Expression<SqlBool>,
): ChExpression<number> {
  return aggregate("uniqIf", [value, condition]);
}

/** ClickHouse `avgIf(value, condition)`. */
export function avgIf(
  value: Expression<number>,
  condition: Expression<SqlBool>,
): ChExpression<number> {
  return aggregate("avgIf", [value, condition]);
}

/** ClickHouse `groupArray(value)`. */
export function groupArray<T>(value: Expression<T>): ChExpression<T[]> {
  return aggregate("groupArray", [value]);
}

/** ClickHouse `groupUniqArray(value)`. */
export function groupUniqArray<T>(value: Expression<T>): ChExpression<T[]> {
  return aggregate("groupUniqArray", [value]);
}

/** ClickHouse `groupUniqArrayIf(value, condition)`. */
export function groupUniqArrayIf<T>(
  value: Expression<T>,
  condition: Expression<SqlBool>,
): ChExpression<T[]> {
  return aggregate("groupUniqArrayIf", [value, condition]);
}

/** ClickHouse `groupUniqArrayArray(array)`: the distinct elements of all arrays. */
export function groupUniqArrayArray<T>(
  array: Expression<T[]>,
): ChExpression<T[]> {
  return aggregate("groupUniqArrayArray", [array]);
}

/** ClickHouse `groupUniqArrayArrayIf(array, condition)`. */
export function groupUniqArrayArrayIf<T>(
  array: Expression<T[]>,
  condition: Expression<SqlBool>,
): ChExpression<T[]> {
  return aggregate("groupUniqArrayArrayIf", [array, condition]);
}

/** ClickHouse `sumMap(map)`: per-key sums over the group. */
export function sumMap<V>(
  map: Expression<Record<string, V>>,
): ChExpression<Record<string, V>> {
  return aggregate("sumMap", [map]);
}

/**
 * ClickHouse `leftUTF8(expression, length)`. The length is inlined as an
 * integer literal; it must be a positive integer.
 */
export function leftUTF8(
  expression: Expression<string>,
  length: number,
): ChExpression<string> {
  if (!Number.isInteger(length) || length < 1) {
    throw new QueryCompileError(
      `leftUTF8 length must be a positive integer, got ${length}.`,
    );
  }
  return functionCall("leftUTF8", [
    expression,
    ValueNode.createImmediate(length),
  ]);
}

/** ClickHouse `length(expression)`: byte length of a String. */
export function byteLength(
  expression: Expression<string>,
): ChExpression<number> {
  return functionCall("length", [expression]);
}

/** ClickHouse `xxHash32(expression)`. */
export function xxHash32(expression: Expression<string>): ChExpression<number> {
  return functionCall("xxHash32", [expression]);
}

/** ClickHouse `toJSONString(expression)`. */
export function toJSONString(
  expression: Expression<unknown>,
): ChExpression<string> {
  return functionCall("toJSONString", [expression]);
}

function dateArg(value: Expression<Date> | Date): OperationNodeSource {
  return value instanceof Date ? ValueNode.create(value) : value;
}

/** ClickHouse `toDate(value)`; a JS `Date` is bound. */
export function toDate(value: Expression<Date> | Date): ChExpression<Date> {
  return functionCall("toDate", [dateArg(value)]);
}

/** ClickHouse `toStartOfMinute(value)`; a JS `Date` is bound. */
export function toStartOfMinute(
  value: Expression<Date> | Date,
): ChExpression<Date> {
  return functionCall("toStartOfMinute", [dateArg(value)]);
}

/** ClickHouse `tuple(a, b, …)`. */
export function tuple<T extends unknown[]>(
  ...values: { [K in keyof T]: Expression<T[K]> }
): ChExpression<T> {
  return functionCall("tuple", values);
}

/** ClickHouse `arrayReverse(array)`. */
function arrayReverse<T>(array: Expression<T[]>): ChExpression<T[]> {
  return functionCall("arrayReverse", [array]);
}

/** ClickHouse `mapFromArrays(keys, values)`. */
export function mapFromArrays<V>(
  keys: Expression<string[]>,
  values: Expression<V[]>,
): ChExpression<Record<string, V>> {
  return functionCall("mapFromArrays", [keys, values]);
}

/**
 * Events metadata as a map: `mapFromArrays(arrayReverse(names),
 * arrayReverse(values))`. Both arrays are reversed so that, for a key stored
 * twice, the last entry wins.
 */
export function metadataMap(
  names: Expression<string[]>,
  values: Expression<string[]>,
): ChExpression<Record<string, string>> {
  return mapFromArrays(arrayReverse(names), arrayReverse(values));
}

// Nesting depth of lambda bodies under construction. Each nesting level
// names its lambda parameter differently, so an inner lambda never shadows
// an outer one. Zero outside any lambda.
// Module state is safe here: `body` runs synchronously inside `lambda`, and
// JavaScript never interleaves another synchronous call with it, so concurrent
// requests cannot observe each other's depth.
let lambdaDepth = 0;

/** `p -> body(p)`, with `p` named `base` plus the nesting depth past zero. */
function lambda<T, U>(
  base: string,
  body: (element: Expression<T>) => Expression<U>,
): OperationNode {
  const param = ColumnNode.create(
    lambdaDepth === 0 ? base : `${base}${lambdaDepth}`,
  );
  lambdaDepth++;
  let bodyNode: OperationNode;
  try {
    bodyNode = body(
      new ExpressionWrapper(param as unknown as OperationNode),
    ).toOperationNode();
  } finally {
    lambdaDepth--;
  }
  return BinaryOperationNode.create(param, OperatorNode.create("->"), bodyNode);
}

/**
 * ClickHouse `arrayMap(v -> body, array)`. `body` receives the lambda
 * parameter: `v` at the top level, `v1`, `v2`, … inside nested calls. The
 * lambda is built as a `->` binary operation; Kysely has no lambda node.
 */
export function arrayMap<T, U>(
  body: (element: Expression<T>) => Expression<U>,
  array: Expression<T[]>,
): ChExpression<U[]> {
  return functionCall("arrayMap", [lambda("v", body), array]);
}

/**
 * `(a, b, …) IN {p:Array(Tuple(…))}`: a column tuple against a list of
 * `TupleParam`s, bound as a single array parameter.
 */
export function tupleIn(
  columns: Expression<unknown>,
  tuples: ReadonlyArray<TupleParam>,
): ChExpression<SqlBool> {
  return new ExpressionWrapper(
    BinaryOperationNode.create(
      columns.toOperationNode(),
      OperatorNode.create("in"),
      ValueNode.create(tuples),
    ) as unknown as OperationNode,
  );
}

/** `expression != ''`, with the empty string inlined rather than bound. */
function nonEmpty(expression: Expression<string>): ChExpression<SqlBool> {
  return new ExpressionWrapper(
    BinaryOperationNode.create(
      expression.toOperationNode(),
      OperatorNode.create("!="),
      ValueNode.createImmediate(""),
    ) as unknown as OperationNode,
  );
}

/** ClickHouse `argMaxIf(value, by, condition)`. */
export function argMaxIf<T>(
  value: Expression<T>,
  by: Expression<unknown>,
  condition: Expression<SqlBool>,
): ChExpression<T> {
  return new ExpressionWrapper(
    AggregateFunctionNode.create("argMaxIf", [
      value.toOperationNode(),
      by.toOperationNode(),
      condition.toOperationNode(),
    ]) as unknown as OperationNode,
  );
}

/**
 * The latest non-empty `value` by `by` across the group:
 * `argMaxIf(value, by, value != '')`.
 */
export function latestNonEmpty(
  value: Expression<string>,
  by: Expression<unknown>,
): ChExpression<string> {
  return argMaxIf(value, by, nonEmpty(value));
}

/**
 * Lower `metadata[key]` to a subscript of {@link metadataMap} over the events
 * `metadata_names` / `metadata_values` columns, so the last entry of a
 * duplicated key wins. Keys follow {@link mapValue}: a string is bound, a
 * `literal(...)` is inlined. `names` / `values` must be one relation's
 * `metadata_names` / `metadata_values` refs; anything else throws.
 */
export function metadataValue(
  names: Expression<string[]>,
  values: Expression<string[]>,
  key: string | Expression<string>,
): ChExpression<string> {
  assertMetadataColumns(names, values);
  return subscript<string>(metadataMap(names, values), key, true);
}

/**
 * Throws unless `names` / `values` are `q.metadata_names` / `q.metadata_values`
 * of one qualifier `q`. The routing pass trusts the lookup's marker and does
 * not walk these arguments, so they may read nothing else.
 */
function assertMetadataColumns(
  names: Expression<string[]>,
  values: Expression<string[]>,
): void {
  const namesOf = qualifierOf(names.toOperationNode(), "metadata_names");
  const valuesOf = qualifierOf(values.toOperationNode(), "metadata_values");
  if (namesOf === undefined || namesOf !== valuesOf) {
    throw new QueryCompileError(
      'metadataValue reads the metadata columns of one relation: pass eb.ref("e.metadata_names") and eb.ref("e.metadata_values").',
    );
  }
}

/** `e` for the reference `e.<column>`; undefined for anything else. */
function qualifierOf(node: OperationNode, column: string): string | undefined {
  if (
    !ReferenceNode.is(node) ||
    !ColumnNode.is(node.column) ||
    node.column.column.name !== column
  ) {
    return undefined;
  }
  return node.table?.table.identifier.name;
}

// Extract the element type `T` from an array-typed `Expression<T[]>`. `arrayJoin`
// uses it to give each produced alias the array's *element* type in the
// builder's output row (ARRAY JOIN yields one row per element, so a
// `mapValues(...)` expression of `V[]` surfaces the alias as `V`, not `V[]`).
// Resolves to `never` for a non-array expression.
type ElementOf<E> =
  E extends Expression<infer A>
    ? A extends ReadonlyArray<infer T>
      ? T
      : never
    : never;

/**
 * ARRAY JOIN clause as a `$call` step:
 * `qb.$call(arrayJoin((eb) => ({ alias: mapKeys(eb.ref("e.col")) })))`.
 * `items` receives the builder's expression builder, so its column references
 * are checked against the query's tables. Each entry's alias is added to the
 * builder's output row type, so consumers of the result (e.g. an outer query
 * selecting from a CTE body) can reference the produced columns and typos on
 * the alias name are compile errors. The element value type is opaque
 * (Kysely's Expression hides its type arg), so aliases surface as `unknown`.
 * The alias must still be projected in a `select` to appear in the emitted
 * SQL. Distinct from the `arrayJoin()` SELECT function.
 */
export function arrayJoin<
  DB,
  TB extends keyof DB,
  Items extends { [K in keyof Items]: Expression<ReadonlyArray<unknown>> },
>(
  items: (eb: ExpressionBuilder<DB, TB>) => Items,
  variant: ArrayJoinVariant = "default",
) {
  return <O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<
    DB,
    TB,
    O & { [K in keyof Items]: ElementOf<Items[K]> }
  > => {
    const produced: Record<string, Expression<unknown>> = items(
      expressionBuilder(qb),
    );
    const list: ArrayJoinItem[] = Object.entries(produced).map(
      ([as, expression]) => ({ expression, as }),
    );
    return qb.withPlugin(
      new ArrayJoinPlugin(list, variant),
    ) as unknown as SelectQueryBuilder<
      DB,
      TB,
      O & { [K in keyof Items]: ElementOf<Items[K]> }
    >;
  };
}

/**
 * LIMIT BY clause as a `$call` step:
 * `qb.$call(limitBy({ count: 1, columns: (eb) => [eb.ref("e.span_id")] }))`.
 * `columns` receives the builder's expression builder, so its references are
 * checked against the query's tables.
 */
export function limitBy<DB, TB extends keyof DB>(spec: LimitBySpec<DB, TB>) {
  return <O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<DB, TB, O> =>
    qb.withPlugin(
      new LimitByPlugin(spec.count, spec.columns(expressionBuilder(qb))),
    );
}

function wrapFinal(
  node: OperationNode,
  tables: ReadonlySet<string>,
): OperationNode {
  if (FinalTableNode.is(node)) return node;
  const name = describeRelation(node).table?.table.identifier.name;
  return name && tables.has(name) ? finalTable(node) : node;
}

/**
 * Plugin that marks named physical tables for `FINAL`. Walks this select's
 * FROM/JOIN table expressions only — apply it on the builder that owns the
 * scores (or other ReplacingMergeTree) relation, including a CTE body.
 */
class FinalPlugin implements KyselyPlugin {
  constructor(private readonly tables: ReadonlySet<string>) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (args.node.kind !== "SelectQueryNode") return args.node;
    const transformer = new ClickHouseOperationNodeTransformer();
    const node = transformer.transformNode(
      args.node,
    ) as ClickHouseSelectQueryNode;
    const froms = (node.from?.froms ?? []).map((from) =>
      wrapFinal(from, this.tables),
    );
    const joins = (node.joins ?? []).map((join) => {
      const table = wrapFinal(join.table, this.tables);
      if (table === join.table) return join;
      return join.on
        ? JoinNode.createWithOn(join.joinType, table, join.on.on)
        : JoinNode.create(join.joinType, table);
    });
    return {
      ...node,
      // cloneWithFroms appends; replacing the list avoids
      // `FROM scores AS s, scores AS s FINAL`.
      ...(node.from ? { from: FromNode.create(froms) } : {}),
      ...(joins.length ? { joins } : {}),
    } as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

/**
 * `FROM <table> FINAL` / `JOIN <table> AS alias FINAL` as a `$call` step:
 * `qb.$call(useFinal(["scores"]))`. Tables declared `dedup: none` (immutable
 * at read time, including the events relations) cannot take FINAL.
 */
export function useFinal(tables: ReadonlyArray<keyof ClickHouseDatabase>) {
  for (const table of tables) {
    if (DEDUP_SPECS[table]?.strategy === "none") {
      throw new QueryCompileError(
        `Cannot apply FINAL to ${table}: declared immutable (dedup strategy none).`,
      );
    }
  }
  const names = new Set<string>(tables);
  return <DB, TB extends keyof DB, O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<DB, TB, O> => qb.withPlugin(new FinalPlugin(names));
}

/**
 * Read soft-deleted rows too: `qb.$call(includeDeleted())`. Applies to this
 * select's FROM/JOIN relations only; nested selects are still filtered. A
 * select that reads no soft-delete table fails to compile.
 */
export function includeDeleted() {
  return <DB, TB extends keyof DB, O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<DB, TB, O> =>
    qb.withPlugin(new SoftDeleteMarkerPlugin("includeDeleted"));
}

/**
 * Drop soft-deleted rows after this select's ORDER BY / LIMIT / LIMIT BY
 * instead of before: `qb.$call(softDeleteAfterLimit())`. For a latest-version
 * pick, where a deletion is a newer version with the flag set; filtering
 * first would return the older live version. Compiles to
 * `select latest.<output>, … from (<this select, flag added>) as latest where
 * latest.<flag> = 0`. The select reads exactly one soft-delete table, has a
 * LIMIT or LIMIT BY, has no GROUP BY or set operation, names every output (no
 * `*`, unaliased expressions), and does not select the flag itself.
 */
export function softDeleteAfterLimit() {
  return <DB, TB extends keyof DB, O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<DB, TB, O> =>
    qb.withPlugin(new SoftDeleteMarkerPlugin("softDeleteAfterLimit"));
}

/** Sets a soft-delete marker on the select; the soft-delete pass reads it. */
class SoftDeleteMarkerPlugin implements KyselyPlugin {
  constructor(
    private readonly marker: "includeDeleted" | "softDeleteAfterLimit",
  ) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (args.node.kind !== "SelectQueryNode") return args.node;
    return { ...args.node, [this.marker]: true } as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}
