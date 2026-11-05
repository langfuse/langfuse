import {
  AliasNode,
  createQueryId,
  IdentifierNode,
  ReferenceNode,
  ColumnNode,
  SelectQueryNode,
  type Expression,
  type KyselyPlugin,
  type OperationNode,
  type RootOperationNode,
  type SelectionNode,
  type SelectQueryBuilder,
} from "kysely";

import { ClickHouseQueryCompiler, type CompiledCondition } from "./compiler";
import { CteNamePlugin } from "./ctes";
import { DedupLoweringPlugin } from "./dedup";
import { QueryCompileError } from "./errors";
import { EventsTableRoutingPlugin } from "./eventsRouting";
import { SoftDeleteFilterPlugin } from "./softDelete";
import {
  TenancyInjectionPlugin,
  assertRelationFree,
  requireProjectId,
} from "./tenancy";
import { validateTypeCompatibility } from "./typecheck";

export type CompiledClickhouseQuery = {
  sql: string;
  params: Record<string, unknown>;
};

/**
 * Anything Kysely will give us a SelectQueryNode for, including plugin-wrapped
 * builders. Kept structural so UNION / `$if` chains stay assignable.
 */
export type ClickhouseCompilable = {
  withPlugin(plugin: KyselyPlugin): ClickhouseCompilable;
  toOperationNode(): RootOperationNode;
};

/**
 * The choke point. Every query that should produce ClickHouse SQL goes
 * through here: the `projectId` parameter is required, so a caller cannot
 * compile without a tenancy scope — omitting it is a compile-time type error.
 * The query reads exactly that one project. CTE names that could mean two
 * relations are rejected (`ctes.ts`). The logical `events` relation is
 * routed to `events_core` or `events_full`, soft-deleted rows are filtered
 * out, tenancy is injected from that project, per-table dedup is applied from
 * the registry, and the dialect compiler refuses to emit SQL unless the tree
 * was identity-stamped by the tenancy and dedup passes (a copied property is
 * not enough). The runtime `requireProjectId` guard remains as
 * defense-in-depth for the one case the type cannot express (an empty
 * `projectId`) and for callers reaching this through an `any` boundary.
 */
export function compileClickhouseQuery(
  query: ClickhouseCompilable,
  projectId: string,
): CompiledClickhouseQuery {
  const scope = requireProjectId(projectId);
  const stamped = query
    .withPlugin(new CteNamePlugin())
    .withPlugin(new EventsTableRoutingPlugin())
    .withPlugin(new SoftDeleteFilterPlugin())
    .withPlugin(new TenancyInjectionPlugin(scope))
    .withPlugin(new DedupLoweringPlugin())
    .toOperationNode();
  const compiler = new ClickHouseQueryCompiler();
  validateTypeCompatibility(stamped);
  const compiled = compiler.compileQuery(stamped, createQueryId());
  return {
    sql: compiled.sql,
    params: { ...compiler.namedParameters },
  };
}

/**
 * SQL text and binds of the WHERE of `query`, for raw-SQL builders that
 * splice an AST condition into their own query:
 * `selectFrom("events as e").where((eb) => eb("e.name", "=", "x"))` with
 * prefix `f1_` → `{ sql: "e.name = {f1_1:String}", params: { f1_1: "x" } }`.
 * Values bind with the types of the FROM relations, as in
 * {@link compileClickhouseQuery}. The CTE and events routing passes validate
 * the condition; which physical events table the caller reads stays its
 * choice. Nothing else of `query` is emitted. Throws on a subquery or raw
 * relation in the condition (the caller scopes only its own relations).
 * Placeholder names start with `paramPrefix`; give each condition of one
 * query its own.
 */
export function compileClickhouseCondition(
  query: ClickhouseCompilable,
  paramPrefix: string,
): CompiledCondition {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(paramPrefix)) {
    throw new QueryCompileError(
      `Parameter prefix "${paramPrefix}" is not a plain identifier.`,
    );
  }
  const node = query
    .withPlugin(new CteNamePlugin())
    .withPlugin(new EventsTableRoutingPlugin())
    .toOperationNode();
  if (!SelectQueryNode.is(node) || !node.where) {
    throw new QueryCompileError(
      "compileClickhouseCondition compiles the WHERE of a select.",
    );
  }
  assertRelationFree(node.where);
  return new ClickHouseQueryCompiler(paramPrefix).compileCondition(node);
}

/**
 * SQL text of a typed expression, for raw-SQL builders that share an AST
 * definition: `metadataMap(e.metadata_names,
 * e.metadata_values)` → `mapFromArrays(arrayReverse(e.metadata_names),
 * arrayReverse(e.metadata_values))`. Throws on a subquery or raw relation
 * (nothing scopes it to a project) and on a bound value.
 */
export function renderClickhouseExpression(
  expression: Expression<unknown>,
): string {
  return renderNode(expression.toOperationNode());
}

/**
 * SQL text of each select of `query`, keyed by output name in select order,
 * for raw-SQL builders that share AST selects: `.select(["e.span_id as id",
 * eb.fn.min("e.start_time").as("start")])` → `{ id: "e.span_id as id",
 * start: "min(e.start_time) as start" }`. Only the select list is read; the
 * FROM just types its columns. Throws like {@link renderClickhouseExpression},
 * on a select without an output name (`*`, raw SQL), and on two selects
 * sharing one.
 */
export function renderClickhouseSelections<O>(
  query: SelectQueryBuilder<any, any, O>,
): Record<keyof O & string, string> {
  const rendered = (query.toOperationNode().selections ?? []).map(
    (selection) => [selectionName(selection), renderNode(selection)] as const,
  );
  assertDistinctOutputNames(rendered.map(([name]) => name));
  return Object.fromEntries(rendered) as Record<keyof O & string, string>;
}

function renderNode(node: OperationNode): string {
  assertRelationFree(node);
  return new ClickHouseQueryCompiler().compileExpression(node);
}

function assertDistinctOutputNames(names: readonly string[]): void {
  const seen = new Set<string>();
  for (const name of names) {
    if (seen.has(name)) {
      throw new QueryCompileError(
        `Two rendered selects share the output name "${name}".`,
      );
    }
    seen.add(name);
  }
}

/** `expr as name` → `name`; an unaliased `e.col` → `col`. */
function selectionName({ selection }: SelectionNode): string {
  if (AliasNode.is(selection) && IdentifierNode.is(selection.alias)) {
    return selection.alias.name;
  }
  if (ReferenceNode.is(selection) && ColumnNode.is(selection.column)) {
    return selection.column.column.name;
  }
  throw new QueryCompileError(
    "A rendered select needs an output name: alias it, or select a column.",
  );
}
