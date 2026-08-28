import {
  createQueryId,
  type KyselyPlugin,
  type RootOperationNode,
} from "kysely";

import type { ExecutionContext } from "../executionContext";
import { ClickHouseQueryCompiler } from "./compiler";
import { TenancyInjectionPlugin, requireExecutionContext } from "./tenancy";
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
 * through here: the `ctx` parameter is required, so a caller cannot compile
 * without a tenancy scope — omitting it is a compile-time type error. Tenancy
 * is injected from that scope, and the dialect compiler refuses to emit SQL
 * unless the tree was identity-stamped by that pass (a copied property is not
 * enough). The runtime `requireExecutionContext` guard remains as
 * defense-in-depth for the one case the type cannot express (an empty
 * `projectId`) and for callers reaching this through an `any` boundary.
 */
export function compileClickhouseQuery(
  query: ClickhouseCompilable,
  ctx: ExecutionContext,
): CompiledClickhouseQuery {
  const scope = requireExecutionContext(ctx);
  const stamped = query
    .withPlugin(new TenancyInjectionPlugin(scope))
    .toOperationNode();
  const compiler = new ClickHouseQueryCompiler();
  validateTypeCompatibility(stamped);
  const compiled = compiler.compileQuery(stamped, createQueryId());
  return {
    sql: compiled.sql,
    params: { ...compiler.namedParameters },
  };
}
