import {
  createQueryId,
  type Expression,
  type KyselyPlugin,
  type RootOperationNode,
} from "kysely";

import { ClickHouseQueryCompiler } from "./compiler";
import { DedupLoweringPlugin } from "./dedup";
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
 * The query reads exactly that one project. Soft-deleted rows are filtered
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
 * SQL text of a typed expression, for raw-SQL builders that share an AST
 * definition: `metadataMap(e.metadata_names,
 * e.metadata_values)` → `mapFromArrays(arrayReverse(e.metadata_names),
 * arrayReverse(e.metadata_values))`. Throws on a subquery or raw relation
 * (nothing scopes it to a project) and on a bound value.
 */
export function renderClickhouseExpression(
  expression: Expression<unknown>,
): string {
  const node = expression.toOperationNode();
  assertRelationFree(node);
  return new ClickHouseQueryCompiler().compileExpression(node);
}
