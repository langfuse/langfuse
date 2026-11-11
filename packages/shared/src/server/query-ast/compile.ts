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
  type WhereNode,
} from "kysely";

import { ClickHouseQueryCompiler } from "./compiler";
import { CteNamePlugin } from "./ctes";
import { DedupLoweringPlugin } from "./dedup";
import { QueryCompileError } from "./errors";
import { EventsTableRoutingPlugin } from "./eventsRouting";
import { PARAM_NAME } from "./extensions";
import { FinalTableNode, type ClickHouseSelectQueryNode } from "./nodes";
import { selectRelations } from "./relations";
import { SchemaReferencePlugin } from "./schemaReferences";
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
 * routed to `events_core` or `events_full`, tenancy is injected from that
 * project, per-table dedup is applied from the registry, and the dialect
 * compiler refuses to emit SQL unless the tree was identity-stamped by the
 * tenancy and dedup passes (a copied property is not enough). The runtime `requireProjectId` guard remains as
 * defense-in-depth for the one case the type cannot express (an empty
 * `projectId`) and for callers reaching this through an `any` boundary.
 */
export function compileClickhouseQuery(
  query: ClickhouseCompilable,
  projectId: string,
): CompiledClickhouseQuery {
  const stamped = applyCompilerPasses(query, projectId);
  const compiler = new ClickHouseQueryCompiler();
  const compiled = compiler.compileQuery(stamped, createQueryId());
  return {
    sql: compiled.sql,
    params: { ...compiler.namedParameters },
  };
}

/**
 * Every compiler pass, in the order it runs. Both entry points apply this
 * list through {@link applyCompilerPasses}, so a pass added here reaches
 * compiled queries and spliced conditions alike.
 */
export function compilerPasses(projectId: string): KyselyPlugin[] {
  return [
    new SchemaReferencePlugin(),
    new CteNamePlugin(),
    new EventsTableRoutingPlugin(),
    new TenancyInjectionPlugin(requireProjectId(projectId)),
    new DedupLoweringPlugin(),
  ];
}

/** The tree of `query` after {@link compilerPasses} and the type check. */
function applyCompilerPasses(
  query: ClickhouseCompilable,
  projectId: string,
): RootOperationNode {
  const node = compilerPasses(projectId)
    .reduce((plugged, pass) => plugged.withPlugin(pass), query)
    .toOperationNode();
  validateTypeCompatibility(node);
  return node;
}

/** A WHERE condition's SQL text, its binds, and the events table it needs. */
export type CompiledCondition = CompiledClickhouseQuery & {
  /** Routing sent a logical `events` relation of the select to `events_full`. */
  requiresEventsFull: boolean;
};

/**
 * The WHERE of `query` as SQL, for raw-SQL builders that splice an AST
 * condition into their own query.
 *
 * Input: a select with a WHERE
 * (`selectFrom("events as e").where("e.name", "=", "x")`), the project, and a
 * placeholder prefix (`f_`).
 *
 * Output: `{ sql: "e.project_id = {f_1:String} and e.name =
 * {f_2:String}", params: { f_1: "proj", f_2: "x" },
 * requiresEventsFull: false }`.
 *
 * Behavior:
 * - runs {@link compilerPasses} and the type check, as
 *   {@link compileClickhouseQuery} does, so the WHERE carries what tenancy
 *   injects;
 * - binds take the types of the FROM relation;
 * - `requiresEventsFull` is the routing verdict: the caller reads
 *   `events_full` when it is set. Over `events_truncated` it is set by the
 *   same conditions; a caller that then reads `events_full` cuts its
 *   selected truncated columns itself.
 *
 * Errors (`QueryCompileError`):
 * - no WHERE;
 * - anything besides plain FROM tables and the WHERE, from the caller or a
 *   pass (a select list, WITH, JOIN, GROUP BY, ORDER BY, LIMIT, LIMIT BY,
 *   DISTINCT, FINAL, a subquery or dedup-wrapped FROM): only the WHERE is
 *   emitted, so the rest would be dropped;
 * - a subquery or raw relation in the condition (`UnscopedRelationError`);
 * - a prefix that is not a plain identifier or ends in a digit;
 * - `sum()`/`avg()` over a non-numeric column (`TypeCompatibilityError`).
 *
 * Edge cases: placeholders are `paramPrefix` plus a counter; give each
 * condition of one query its own prefix. A prefix ending in a digit would let
 * two prefixes name one placeholder (`f1` + 1 and `f` + 11 are both `f11`).
 */
export function compileClickhouseCondition(
  query: ClickhouseCompilable,
  projectId: string,
  paramPrefix: string,
): CompiledCondition {
  assertParamPrefix(paramPrefix);
  requireProjectId(projectId);
  const unplugged = query.toOperationNode();
  assertSelectWithWhere(unplugged);
  const node = applyCompilerPasses(query, projectId);
  assertSelectWithWhere(node);
  assertOnlyFromAndWhere(node);
  assertRelationFree(unplugged.where);
  return {
    ...new ClickHouseQueryCompiler(paramPrefix).compileCondition(node),
    requiresEventsFull: selectRelations(node).some(
      ({ table }) => table?.table.identifier.name === "events_full",
    ),
  };
}

/** Throws on a placeholder prefix that is not {@link PARAM_NAME}. */
function assertParamPrefix(paramPrefix: string): void {
  if (!PARAM_NAME.test(paramPrefix)) {
    throw new QueryCompileError(
      `Parameter prefix "${paramPrefix}" must be a plain identifier that does not end in a digit.`,
    );
  }
}

/** Throws unless `node` is a select with a WHERE. */
function assertSelectWithWhere(
  node: RootOperationNode,
): asserts node is SelectQueryNode & { where: WhereNode } {
  if (!SelectQueryNode.is(node) || !node.where) {
    throw new QueryCompileError(
      "compileClickhouseCondition compiles the WHERE of a select.",
    );
  }
}

/**
 * Select fields a spliced condition may carry: the FROM and WHERE it is
 * compiled from. A select list is rejected: a WHERE reference to one of its
 * aliases would read a column of the caller's query instead.
 */
const CONDITION_SELECT_FIELDS: ReadonlySet<string> = new Set([
  "kind",
  "from",
  "where",
]);

/**
 * Throws when the select carries anything the WHERE-only splice would drop:
 * any field outside {@link CONDITION_SELECT_FIELDS} (WITH, JOIN, GROUP BY,
 * HAVING, ORDER BY, LIMIT, OFFSET, LIMIT BY, DISTINCT, ARRAY JOIN, or a field
 * added later), or a FROM item that is not a plain table (a subquery, a dedup
 * wrap, `useFinal()`).
 */
function assertOnlyFromAndWhere(node: ClickHouseSelectQueryNode): void {
  const extra = Object.entries(node)
    .filter(
      ([field, value]) =>
        value !== undefined && !CONDITION_SELECT_FIELDS.has(field),
    )
    .map(([field]) => field);
  if (extra.length > 0) {
    throw new QueryCompileError(
      `compileClickhouseCondition emits only the WHERE of a select over plain FROM tables; this select also has ${extra.join(", ")}.`,
    );
  }
  const nonTable = selectRelations(node).some(
    (relation) =>
      relation.table === undefined || FinalTableNode.is(relation.node),
  );
  if (nonTable) {
    throw new QueryCompileError(
      "compileClickhouseCondition emits only the WHERE of a select over plain FROM tables; a FROM item here is a subquery, FINAL, or a dedup wrap.",
    );
  }
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
