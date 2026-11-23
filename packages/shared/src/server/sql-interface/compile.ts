import { compileClickhouseQuery } from "../query-ast/compile";
import { QueryCompileError } from "../query-ast/errors";
import { CustomerSqlError } from "./errors";
import { parseCustomerSql } from "./parser";
import { translateCustomerSql, type TranslateOptions } from "./translate";

export type CustomerSqlOptions = Partial<TranslateOptions>;

export type CompiledCustomerSql = {
  sql: string;
  params: Record<string, unknown>;
  columns: string[];
};

const DEFAULTS: TranslateOptions = {
  defaultLimit: 100,
  maxLimit: 1000,
  maxOffset: 10_000,
};

/**
 * Customer SQL → tenant-scoped ClickHouse SQL. Lexes and parses the
 * restricted grammar (`parser.ts`), lowers it onto the query AST over the
 * customer `observations` table (`translate.ts`), then compiles through
 * `compileClickhouseQuery`, which injects `project_id`, routes
 * events_core/events_full and re-checks the function allowlist.
 *
 * Throws {@link CustomerSqlError} (HTTP 400) for any query it rejects.
 */
export function compileCustomerSql(
  sql: string,
  projectId: string,
  options: CustomerSqlOptions = {},
): CompiledCustomerSql {
  const stmt = parseCustomerSql(sql);
  const { query, columns } = translateCustomerSql(stmt, {
    ...DEFAULTS,
    ...options,
  });
  try {
    const compiled = compileClickhouseQuery(query, projectId);
    return { ...compiled, columns };
  } catch (error) {
    if (error instanceof QueryCompileError) {
      throw new CustomerSqlError(error.message);
    }
    throw error;
  }
}
