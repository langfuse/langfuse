/**
 * Test-only runner for one compiler pass. A pass suite applies just the pass
 * it tests, so another pass cannot hide a gap in it (a rejection one pass
 * relies on, a rewrite another pass undoes). Production never comes here:
 * `compileClickhouseQuery` and `compileClickhouseCondition` run every pass of
 * `compilerPasses`, and only `*.test.ts` files import this module.
 */
import {
  createQueryId,
  type KyselyPlugin,
  type RootOperationNode,
} from "kysely";

import type { ClickhouseCompilable, CompiledClickhouseQuery } from "./compile";
import { ClickHouseQueryCompiler } from "./compiler";
import { stampCompiledTree } from "./tenancy";

/** The tree of `query` after `pass` alone, with no other pass or check. */
export function applyPassOnly(
  query: ClickhouseCompilable,
  pass: KyselyPlugin,
): RootOperationNode {
  return query.withPlugin(pass).toOperationNode();
}

/**
 * SQL of `node` with no further pass: a tree {@link applyPassOnly} returned,
 * or a builder's own `toOperationNode()`. The compiler emits only trees the
 * tenancy pass stamped, so this stamps `node` first; no tenancy scope is
 * added.
 */
export function renderPassOutput(
  node: RootOperationNode,
): CompiledClickhouseQuery {
  const compiler = new ClickHouseQueryCompiler();
  const { sql } = compiler.compileQuery(
    stampCompiledTree(node),
    createQueryId(),
  );
  return { sql, params: { ...compiler.namedParameters } };
}
