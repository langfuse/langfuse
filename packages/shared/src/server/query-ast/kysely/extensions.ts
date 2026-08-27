import {
  ColumnNode,
  ExpressionWrapper,
  FunctionNode,
  IdentifierNode,
  ReferenceNode,
  TableNode,
  ValueNode,
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

export type ArrayJoinItem = {
  expression: OperationNodeSource;
  as: string;
};

/**
 * Plugin that attaches an {@link ArrayJoinNode} onto the select node.
 * Record for the evaluation: ARRAY JOIN = plugin + transformer (no fork).
 */
export class ArrayJoinPlugin implements KyselyPlugin {
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
    const arrayJoin = ArrayJoinNode.create(
      this.items.map((item) => ({
        expression: toNode(item.expression),
        alias: IdentifierNode.create(item.as),
      })),
      this.variant,
    );
    return {
      ...node,
      arrayJoins: [...(node.arrayJoins ?? []), arrayJoin],
    } as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

export type LimitBySpec = {
  count: number;
  columns: ReadonlyArray<string>;
};

/**
 * Plugin that attaches a {@link LimitByNode} onto the select node.
 * Record for the evaluation: LIMIT BY = plugin + transformer (no fork).
 */
export class LimitByPlugin implements KyselyPlugin {
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

function columnRef(name: string): OperationNode {
  const parts = name.split(".");
  if (parts.length === 2) {
    return ReferenceNode.create(
      ColumnNode.create(parts[1]),
      TableNode.create(parts[0]),
    );
  }
  return ColumnNode.create(name);
}

export function mapKeys(column: string): OperationNode {
  return FunctionNode.create("mapKeys", [columnRef(column)]);
}

export function mapValues(column: string): OperationNode {
  return FunctionNode.create("mapValues", [columnRef(column)]);
}

/**
 * Lower `metadata[key]` to a traced array-subscript + `indexOf` node.
 * The key is a bound `ValueNode`, not a SQL literal. Record: helper builds
 * an {@link ArrayIndexNode} (transformer + compiler, no plugin, no fork).
 */
export function metadataValue(
  tableAlias: string,
  key: string,
): ExpressionWrapper<ClickHouseDatabase, "events_core", string | number> {
  return new ExpressionWrapper(
    ArrayIndexNode.create(
      columnRef(`${tableAlias}.metadata_values`),
      FunctionNode.create("indexOf", [
        columnRef(`${tableAlias}.metadata_names`),
        ValueNode.create(key),
      ]),
    ) as unknown as OperationNode,
  );
}

export function withArrayJoin<DB, TB extends keyof DB, O>(
  qb: SelectQueryBuilder<DB, TB, O>,
  items: ReadonlyArray<ArrayJoinItem>,
  variant: ArrayJoinVariant = "default",
): SelectQueryBuilder<DB, TB, O> {
  return qb.withPlugin(new ArrayJoinPlugin(items, variant));
}

export function withLimitBy<DB, TB extends keyof DB, O>(
  qb: SelectQueryBuilder<DB, TB, O>,
  spec: LimitBySpec,
): SelectQueryBuilder<DB, TB, O> {
  return qb.withPlugin(new LimitByPlugin(spec));
}
