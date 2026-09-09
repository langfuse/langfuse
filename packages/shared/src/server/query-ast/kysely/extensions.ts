/**
 * ClickHouse-specific query-builder extensions for the Kysely dialect.
 *
 * Kysely has no native representation for several ClickHouse constructs, so
 * this file supplies them in three forms:
 *   - Plugins ({@link ArrayJoinPlugin}, {@link LimitByPlugin}) that attach a
 *     custom operation node (`ArrayJoinNode` / `LimitByNode`) onto the select
 *     node during query transformation; the ClickHouse compiler renders them.
 *   - `$call` helpers ({@link arrayJoin}, {@link limitBy}) that apply those
 *     plugins while extending the builder's output row type, so produced
 *     aliases are type-checked and misspelled references are compile errors.
 *   - Typed expression helpers ({@link mapKeys}, {@link mapValues},
 *     {@link metadataValue}) that build ClickHouse map/array function calls and
 *     `metadata[key]` subscripts as real, parameter-bound nodes — never raw SQL
 *     strings — so they escape and compose like any other expression.
 */
import {
  ColumnNode,
  ExpressionWrapper,
  FunctionNode,
  IdentifierNode,
  ReferenceNode,
  TableNode,
  ValueNode,
  type Expression,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type RootOperationNode,
  type SelectQueryBuilder,
} from "kysely";

import {
  ArrayIndexNode,
  ArrayJoinNode,
  LimitByNode,
  type ArrayJoinVariant,
  type ClickHouseSelectQueryNode,
} from "./nodes";
import type { ClickHouseDatabase } from "./schema";
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

type LimitBySpec = {
  count: number;
  columns: ReadonlyArray<string>;
};

/** Plugin that attaches a {@link LimitByNode} onto the select node. */
class LimitByPlugin implements KyselyPlugin {
  constructor(private readonly spec: LimitBySpec) {}

  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    if (args.node.kind !== "SelectQueryNode") return args.node;
    const transformer = new ClickHouseOperationNodeTransformer();
    const node = transformer.transformNode(
      args.node,
    ) as ClickHouseSelectQueryNode;
    return {
      ...node,
      limitBy: LimitByNode.create(
        ValueNode.createImmediate(this.spec.count),
        this.spec.columns.map(columnRef),
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

// For callers whose column arrives as a single, possibly dotted string — e.g.
// the `limitBy` column list. Kysely only parses `"table.column"` at the
// expression-builder layer (`eb.ref`) and does not export its string-reference
// parser, and these plugins build raw OperationNodes with no ExpressionBuilder
// in scope, so we split the dotted name here rather than route through a string.
function columnRef(name: string): OperationNode {
  const parts = name.split(".");
  return parts.length === 2
    ? qualifiedColumn(parts[0], parts[1])
    : ColumnNode.create(name);
}

function arrayFunction<T>(fn: string, column: string): Expression<T[]> {
  return new ExpressionWrapper<
    ClickHouseDatabase,
    keyof ClickHouseDatabase,
    T[]
  >(FunctionNode.create(fn, [columnRef(column)]) as unknown as OperationNode);
}

/** `mapKeys(map)` as a typed array expression (element type defaults to string). */
export function mapKeys<K = string>(column: string): Expression<K[]> {
  return arrayFunction<K>("mapKeys", column);
}

/** `mapValues(map)` as a typed array expression (element type defaults to string). */
export function mapValues<V = string>(column: string): Expression<V[]> {
  return arrayFunction<V>("mapValues", column);
}

/**
 * Lower `metadata[key]` to a traced array-subscript + `indexOf` node.
 * The key is a bound `ValueNode`, not a SQL literal.
 */
export function metadataValue(
  tableAlias: string,
  key: string,
): ExpressionWrapper<ClickHouseDatabase, "events_core", string | number> {
  return new ExpressionWrapper(
    ArrayIndexNode.create(
      qualifiedColumn(tableAlias, "metadata_values"),
      FunctionNode.create("indexOf", [
        qualifiedColumn(tableAlias, "metadata_names"),
        ValueNode.create(key),
      ]),
    ) as unknown as OperationNode,
  );
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
 * ARRAY JOIN clause as a `$call` step: `qb.$call(arrayJoin({ alias: expr }))`.
 * Each entry's alias is added to the builder's output row type, so consumers of
 * the result (e.g. an outer query selecting from a CTE body) can reference the
 * produced columns and typos on the alias name are compile errors. The element
 * value type is opaque (Kysely's Expression hides its type arg), so aliases
 * surface as `unknown`. The alias must still be projected in a `select` to
 * appear in the emitted SQL. Distinct from the `arrayJoin()` SELECT function.
 */
export function arrayJoin<
  Items extends { [K in keyof Items]: Expression<ReadonlyArray<unknown>> },
>(items: Items, variant: ArrayJoinVariant = "default") {
  const list: ArrayJoinItem[] = Object.entries(items).map(
    ([as, expression]) => ({
      expression: expression as OperationNodeSource,
      as,
    }),
  );
  return <DB, TB extends keyof DB, O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<
    DB,
    TB,
    O & { [K in keyof Items]: ElementOf<Items[K]> }
  > =>
    qb.withPlugin(
      new ArrayJoinPlugin(list, variant),
    ) as unknown as SelectQueryBuilder<
      DB,
      TB,
      O & { [K in keyof Items]: ElementOf<Items[K]> }
    >;
}

/** LIMIT BY clause as a `$call` step: `qb.$call(limitBy({ count, columns }))`. */
export function limitBy(spec: LimitBySpec) {
  return <DB, TB extends keyof DB, O>(
    qb: SelectQueryBuilder<DB, TB, O>,
  ): SelectQueryBuilder<DB, TB, O> => qb.withPlugin(new LimitByPlugin(spec));
}
