/**
 * Derived columns: names a query reads like a column (`.select("e.metadata")`,
 * `.where("e.resolved_trace_name", "is not", null)`) that stand for an
 * expression over the relation's physical columns. `schema.ts` declares each
 * one's name and type; this module holds the expressions and the pass that
 * expands them. The pass runs first in `compileClickhouseQuery`, so tenancy,
 * dedup and the compiler only ever see physical columns.
 *
 * A selection without an alias keeps the derived name: `select e.metadata`
 * compiles to `mapFromArrays(…) AS metadata`.
 */
import {
  AliasNode,
  ColumnNode,
  expressionBuilder,
  ExpressionWrapper,
  IdentifierNode,
  ReferenceNode,
  SelectionNode,
  TableNode,
  type Expression,
  type KyselyPlugin,
  type OperationNode,
  type PluginTransformQueryArgs,
  type PluginTransformResultArgs,
  type QueryId,
  type RootOperationNode,
  type SelectQueryNode,
} from "kysely";

import { QueryCompileError } from "./errors";
import {
  coalesce,
  ifElse,
  isEmpty,
  metadataMap,
  nullIfEmpty,
} from "./extensions";
import { FinalTableNode } from "./nodes";
import {
  type ClickHouseDatabase,
  type DerivedColumnsOf,
  type EventsColumn,
} from "./schema";
import { ClickHouseOperationNodeTransformer } from "./transformer";

type EventsRow = ClickHouseDatabase["events_core"];

/** A physical events column, qualified like the derived reference it expands. */
type EventsColumnRef = <C extends EventsColumn>(
  column: C,
) => Expression<EventsRow[C]>;

const EVENTS_DERIVED_EXPRESSIONS: {
  [C in DerivedColumnsOf["events_core"]]: (
    column: EventsColumnRef,
  ) => Expression<EventsRow[C]>;
} = {
  metadata: (column) =>
    metadataMap(column("metadata_names"), column("metadata_values")),
  // `trace_name` when set, else the name of a root observation.
  resolved_trace_name: (column) => {
    const eb = expressionBuilder<
      ClickHouseDatabase,
      keyof ClickHouseDatabase
    >();
    const isRoot = eb.or([
      isEmpty(column("parent_span_id")),
      eb(column("is_app_root"), "=", eb.lit(true)),
    ]);
    return coalesce(
      nullIfEmpty(column("trace_name")),
      ifElse(isRoot, nullIfEmpty(column("name")), eb.lit(null)),
    );
  },
};

const DERIVED_EXPRESSIONS: {
  [T in keyof DerivedColumnsOf as DerivedColumnsOf[T] extends never
    ? never
    : T]: Record<
    DerivedColumnsOf[T],
    (column: EventsColumnRef) => Expression<unknown>
  >;
} = {
  events_core: EVENTS_DERIVED_EXPRESSIONS,
  events_full: EVENTS_DERIVED_EXPRESSIONS,
};

type TableWithDerived = keyof typeof DERIVED_EXPRESSIONS;

type DerivedExpression = (column: EventsColumnRef) => Expression<unknown>;

const DERIVED_BY_TABLE = new Map<string, Record<string, DerivedExpression>>(
  Object.entries(DERIVED_EXPRESSIONS),
);

function derivedExpressionOf(
  table: string | undefined,
  column: string,
): DerivedExpression | undefined {
  const columns = table ? DERIVED_BY_TABLE.get(table) : undefined;
  return columns && Object.hasOwn(columns, column)
    ? columns[column]
    : undefined;
}

/**
 * The expression a derived column stands for, over physical columns qualified
 * by `qualifier` (unqualified when undefined). Raw-SQL builders render it with
 * `renderClickhouseExpression` to share the definition.
 */
export function derivedColumnExpression<T extends TableWithDerived>(
  table: T,
  column: DerivedColumnsOf[T] & string,
  qualifier?: string,
): Expression<unknown> {
  const columns: Record<string, DerivedExpression> = DERIVED_EXPRESSIONS[table];
  return columns[column](columnRefIn(qualifier));
}

function columnRefIn(qualifier: string | undefined): EventsColumnRef {
  return (name) =>
    new ExpressionWrapper(
      ReferenceNode.create(
        ColumnNode.create(name),
        qualifier ? TableNode.create(qualifier) : undefined,
      ),
    );
}

/**
 * What one SELECT makes visible to unqualified and qualified names: each
 * FROM/JOIN name or alias → its registry table, or undefined for a CTE or
 * subquery (whose columns are its own outputs, never derived).
 */
type SelectScope = {
  relations: Map<string, string | undefined>;
  /** One entry per FROM/JOIN relation, in the same form. */
  tables: (string | undefined)[];
  ctes: Set<string>;
  /** Output aliases of expressions other than a same-named column reference. */
  computedAliases: Set<string>;
};

export class DerivedColumnPlugin implements KyselyPlugin {
  transformQuery(args: PluginTransformQueryArgs): RootOperationNode {
    return new DerivedColumnTransformer().transformNode(args.node);
  }

  async transformResult(args: PluginTransformResultArgs) {
    return args.result;
  }
}

class DerivedColumnTransformer extends ClickHouseOperationNodeTransformer {
  /**
   * The SELECTs enclosing the node being transformed, innermost last. Pushed
   * on entering a SELECT and popped on leaving it, so it is empty between
   * compiles.
   */
  private readonly scopes: SelectScope[] = [];

  protected override transformSelectQuery(
    node: SelectQueryNode,
    queryId?: QueryId,
  ): SelectQueryNode {
    this.scopes.push(selectScopeOf(node, this.scopes));
    try {
      return super.transformSelectQuery(node, queryId);
    } finally {
      this.scopes.pop();
    }
  }

  protected override transformSelection(
    node: SelectionNode,
    queryId?: QueryId,
  ): SelectionNode {
    const expansion = ReferenceNode.is(node.selection)
      ? this.expandReference(node.selection)
      : undefined;
    if (!expansion) return super.transformSelection(node, queryId);
    return SelectionNode.create(
      AliasNode.create(expansion.node, IdentifierNode.create(expansion.column)),
    );
  }

  protected override transformNodeImpl<T extends OperationNode>(
    node: T,
    queryId?: QueryId,
  ): T {
    if (ReferenceNode.is(node)) {
      const expansion = this.expandReference(node);
      // Anti-pattern: cast through `unknown`. A derived reference becomes the
      // expression it stands for, which is not a ReferenceNode; every slot a
      // column reference may fill also accepts an expression.
      if (expansion) return expansion.node as unknown as T;
    }
    return super.transformNodeImpl(node, queryId);
  }

  private expandReference(
    node: ReferenceNode,
  ): { column: string; node: OperationNode } | undefined {
    if (!ColumnNode.is(node.column)) return undefined;
    const column = node.column.column.name;
    const qualifier = node.table?.table.identifier.name;
    const table = qualifier
      ? this.qualifiedTable(qualifier)
      : this.unqualifiedTable(column);
    const expression = derivedExpressionOf(table, column);
    if (!expression) return undefined;
    const expansion = expression(columnRefIn(qualifier)).toOperationNode();
    if (!qualifier) this.assertInputsNotShadowed(column, expansion);
    return { column, node: expansion };
  }

  /**
   * An unqualified expansion reads unqualified columns, which ClickHouse
   * resolves to a same-named SELECT alias before the table column:
   * `trace_name AS name` would feed `trace_name` into `nullIf(name, '')`.
   */
  private assertInputsNotShadowed(column: string, expansion: OperationNode) {
    const aliases = this.scopes.at(-1)?.computedAliases;
    const shadowed = [...columnsReadBy(expansion)].filter((input) =>
      aliases?.has(input),
    );
    if (shadowed.length > 0) {
      throw new QueryCompileError(
        `Derived column "${column}" reads ${shadowed.join(", ")}, shadowed by a SELECT alias of the same name; qualify it.`,
      );
    }
  }

  /** Registry table of the innermost relation named `qualifier`. */
  private qualifiedTable(qualifier: string): string | undefined {
    for (const scope of [...this.scopes].reverse()) {
      if (scope.relations.has(qualifier)) return scope.relations.get(qualifier);
    }
    return undefined;
  }

  /**
   * Registry table an unqualified `column` resolves to: the innermost SELECT's
   * only relation. Throws where ClickHouse could resolve the name elsewhere —
   * another relation in scope, or a same-named alias of another expression.
   */
  private unqualifiedTable(column: string): string | undefined {
    const scope = this.scopes.at(-1);
    if (!scope) return undefined;
    const tables = scope.tables;
    if (!tables.some((table) => derivedExpressionOf(table, column))) {
      return undefined;
    }
    if (tables.length > 1) {
      throw new QueryCompileError(
        `Derived column "${column}" is ambiguous with several relations in scope; qualify it.`,
      );
    }
    if (scope.computedAliases.has(column)) {
      throw new QueryCompileError(
        `Derived column "${column}" is shadowed by a SELECT alias of the same name.`,
      );
    }
    return tables[0];
  }
}

function selectScopeOf(
  node: SelectQueryNode,
  enclosing: readonly SelectScope[],
): SelectScope {
  const ctes = new Set(
    (node.with?.expressions ?? []).map(
      (cte) => cte.name.table.table.identifier.name,
    ),
  );
  const isCte = (name: string) =>
    ctes.has(name) || enclosing.some((scope) => scope.ctes.has(name));
  const relations = new Map<string, string | undefined>();
  const tables: (string | undefined)[] = [];
  for (const wrapped of [
    ...(node.from?.froms ?? []),
    ...(node.joins ?? []).map((join) => join.table),
  ]) {
    // FINAL wraps the whole relation, alias included: `scores AS s FINAL`.
    const maybeFinal: { kind: string } = wrapped;
    const relation = FinalTableNode.is(maybeFinal) ? maybeFinal.table : wrapped;
    const aliased = AliasNode.is(relation) ? relation : undefined;
    const inner = aliased ? aliased.node : relation;
    const name = TableNode.is(inner) ? inner.table.identifier.name : undefined;
    const table = name && !isCte(name) ? name : undefined;
    tables.push(table);
    if (name) relations.set(name, table);
    if (aliased && IdentifierNode.is(aliased.alias)) {
      relations.set(aliased.alias.name, table);
    }
  }
  return { relations, tables, ctes, computedAliases: computedAliasesOf(node) };
}

function computedAliasesOf(node: SelectQueryNode): Set<string> {
  const aliases = new Set<string>();
  for (const { selection } of node.selections ?? []) {
    if (!AliasNode.is(selection) || !IdentifierNode.is(selection.alias)) {
      continue;
    }
    const alias = selection.alias.name;
    const target = selection.node;
    const sameNamedColumn =
      ReferenceNode.is(target) &&
      ColumnNode.is(target.column) &&
      target.column.column.name === alias;
    if (!sameNamedColumn) aliases.add(alias);
  }
  return aliases;
}

function columnsReadBy(node: unknown, found = new Set<string>()): Set<string> {
  if (!node || typeof node !== "object") return found;
  if (isOperationNode(node) && ColumnNode.is(node)) {
    found.add(node.column.name);
    return found;
  }
  for (const child of Object.values(node)) columnsReadBy(child, found);
  return found;
}

function isOperationNode(value: object): value is OperationNode {
  return "kind" in value && typeof value.kind === "string";
}
