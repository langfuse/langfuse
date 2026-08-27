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
 * through here: ExecutionContext is mandatory, tenancy is injected, the
 * dialect compiler refuses to emit SQL without that stamp.
 */
export function compileClickhouseQuery(
  query: ClickhouseCompilable,
  ctx?: ExecutionContext,
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
