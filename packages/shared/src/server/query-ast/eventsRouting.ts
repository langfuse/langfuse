/**
 * Logical `events` routing. Runs first in every compile.
 *
 * Call sites read the logical `events` relation; this pass replaces every
 * FROM/JOIN reference to it with `events_core` or `events_full`. One choice
 * per compile: if any expression in the tree could read a truncated
 * `events_core` value differently from `events_full`, every logical
 * reference becomes `events_full`, otherwise `events_core`. Routing to
 * `events_full` only costs performance; routing a truncation-sensitive read
 * to `events_core` silently returns truncated values or drops matches, so any
 * shape the pass does not recognise counts as truncation-sensitive.
 *
 * A reference is truncation-sensitive when it names a column in
 * {@link EVENTS_CORE_TRUNCATED_COLUMNS} (by bare column name, whichever
 * relation it belongs to), selects `*`, or is a raw fragment that mentions
 * such a column. The only exempt shape is a metadata predicate that
 * `metadataFilterIsEventsCoreSafe` accepts, the rule the raw-SQL builders
 * route by:
 *
 *   metadataValue(e, k) = 'short'        → events_core (< 200 code points)
 *   startsWith(metadataValue(e, k), 'p') → events_core (≤ 200 code points)
 *   e.input = 'x', select e.input        → events_full
 *
 * Physical `events_core` / `events_full` references pass through unchanged.
 */
import {
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
  ReferenceNode,
  SelectAllNode,
  SelectQueryNode,
  TableNode,
  ValueNode,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  type RootOperationNode,
} from "kysely";

import { metadataFilterIsEventsCoreSafe } from "../queries/clickhouse-sql/events-core-truncation";
import { QueryCompileError } from "./errors";
import { ArrayIndexNode } from "./nodes";
import { EVENTS_CORE_TRUNCATED_COLUMNS } from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

const LOGICAL_EVENTS = "events";

type PhysicalEventsTable = "events_core" | "events_full";

const TRUNCATED_COLUMN_IN_RAW = new RegExp(
  `\\b(${[...EVENTS_CORE_TRUNCATED_COLUMNS].join("|")})\\b`,
);

export class EventsTableRoutingPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    const analysis = new EventsReadAnalysis();
    analysis.transformNode(args.node);
    if (!analysis.readsLogicalEvents) return args.node;
    return new EventsTableRouter(
      analysis.truncationSensitive ? "events_full" : "events_core",
    ).transformNode(args.node) as RootOperationNode;
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

/** Read-only walk; the transformer is used for its traversal only. */
class EventsReadAnalysis extends ClickHouseOperationNodeTransformer {
  readsLogicalEvents = false;
  truncationSensitive = false;

  protected override transformNodeImpl<T extends OperationNode>(
    node: T,
    queryId?: QueryId,
  ): T {
    if (isCoreSafeMetadataPredicate(node)) return node;

    if (FromNode.is(node) && node.froms.some(isLogicalEventsRelation)) {
      this.readsLogicalEvents = true;
    }
    if (JoinNode.is(node) && isLogicalEventsRelation(node.table)) {
      this.readsLogicalEvents = true;
    }
    if (
      (ColumnNode.is(node) &&
        EVENTS_CORE_TRUNCATED_COLUMNS.has(node.column.name)) ||
      (SelectQueryNode.is(node) &&
        (node.selections ?? []).some((s) => selectsAll(s.selection))) ||
      (RawNode.is(node) &&
        node.sqlFragments.some((fragment) =>
          TRUNCATED_COLUMN_IN_RAW.test(fragment),
        ))
    ) {
      this.truncationSensitive = true;
    }
    if (
      CommonTableExpressionNode.is(node) &&
      node.name.table.table.identifier.name === LOGICAL_EVENTS
    ) {
      throw new QueryCompileError(
        `A CTE cannot be named "${LOGICAL_EVENTS}": the name is the logical events relation.`,
      );
    }
    return super.transformNodeImpl(node, queryId);
  }
}

class EventsTableRouter extends ClickHouseOperationNodeTransformer {
  constructor(private readonly table: PhysicalEventsTable) {
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
    if (isLogicalEventsTable(node)) {
      return AliasNode.create(
        TableNode.create(this.table),
        IdentifierNode.create(LOGICAL_EVENTS),
      );
    }
    if (AliasNode.is(node) && isLogicalEventsTable(node.node)) {
      return AliasNode.create(TableNode.create(this.table), node.alias);
    }
    return this.transformNode(node, queryId);
  }
}

function isLogicalEventsTable(node: OperationNode): boolean {
  return (
    TableNode.is(node) &&
    node.table.schema === undefined &&
    node.table.identifier.name === LOGICAL_EVENTS
  );
}

function isLogicalEventsRelation(node: OperationNode): boolean {
  return (
    isLogicalEventsTable(node) ||
    (AliasNode.is(node) && isLogicalEventsTable(node.node))
  );
}

/**
 * `*` or `e.*` in a select list. Only called on a select's own selections:
 * `count(*)` wraps its `*` in a selection node too.
 */
function selectsAll(node: OperationNode): boolean {
  return (
    SelectAllNode.is(node) ||
    (ReferenceNode.is(node) && SelectAllNode.is(node.column))
  );
}

/**
 * `metadataValue(e, k) = v` or `startsWith(metadataValue(e, k), v)` with a
 * bound `v` that `metadataFilterIsEventsCoreSafe` accepts.
 */
function isCoreSafeMetadataPredicate(node: OperationNode): boolean {
  if (
    BinaryOperationNode.is(node) &&
    OperatorNode.is(node.operator) &&
    node.operator.operator === "="
  ) {
    return (
      isMetadataValue(node.leftOperand) &&
      isCoreSafeValue("=", node.rightOperand)
    );
  }
  if (
    FunctionNode.is(node) &&
    node.func === "startsWith" &&
    node.arguments.length === 2
  ) {
    return (
      isMetadataValue(node.arguments[0]) &&
      isCoreSafeValue("starts with", node.arguments[1])
    );
  }
  return false;
}

function isCoreSafeValue(
  operator: "=" | "starts with",
  node: OperationNode,
): boolean {
  return (
    ValueNode.is(node) && metadataFilterIsEventsCoreSafe(operator, node.value)
  );
}

/**
 * The tree `metadataValue` builds:
 * `mapFromArrays(arrayReverse(t.metadata_names), arrayReverse(t.metadata_values))[k]`,
 * both columns on the same qualifier.
 */
// Typed `{ kind: string }`: `ArrayIndexNode` is outside Kysely's closed
// `OperationNode` union, so narrowing an `OperationNode` to it yields `never`.
function isMetadataValue(node: { kind: string }): boolean {
  if (!ArrayIndexNode.is(node) || !ValueNode.is(node.index)) return false;
  const map = node.array;
  if (
    !FunctionNode.is(map) ||
    map.func !== "mapFromArrays" ||
    map.arguments.length !== 2
  ) {
    return false;
  }
  const [names, values] = map.arguments.map(reversedColumn);
  return (
    names?.column === "metadata_names" &&
    values?.column === "metadata_values" &&
    names.qualifier === values.qualifier
  );
}

function reversedColumn(
  node: OperationNode,
): { column: string; qualifier?: string } | undefined {
  if (
    !FunctionNode.is(node) ||
    node.func !== "arrayReverse" ||
    node.arguments.length !== 1
  ) {
    return undefined;
  }
  const ref = node.arguments[0];
  if (ReferenceNode.is(ref) && ColumnNode.is(ref.column)) {
    return {
      column: ref.column.column.name,
      qualifier: ref.table?.table.identifier.name,
    };
  }
  return undefined;
}
