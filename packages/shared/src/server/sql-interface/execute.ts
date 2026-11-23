import { ClickHouseError } from "@clickhouse/client";

import { queryClickhouse } from "../repositories/clickhouse";
import { compileCustomerSql, type CustomerSqlOptions } from "./compile";
import { CustomerSqlError } from "./errors";

/** Resource caps on every customer query, enforced by ClickHouse. */
const EXECUTION_SETTINGS = {
  readonly: "2",
  max_execution_time: 30,
  max_result_rows: "1000",
  max_memory_usage: "4000000000",
} as const;

/**
 * Compiles and runs a customer query; rows are keyed by output column.
 * Timeouts and resource limits keep their `ClickHouseResourceError` (422);
 * any other ClickHouse rejection, such as `sum(name)`, becomes a
 * {@link CustomerSqlError} without the compiled SQL in its message.
 */
export async function executeCustomerSql(
  sql: string,
  projectId: string,
  options: CustomerSqlOptions = {},
): Promise<{ columns: string[]; rows: Record<string, unknown>[] }> {
  const compiled = compileCustomerSql(sql, projectId, options);
  try {
    const rows = await queryClickhouse<Record<string, unknown>>({
      query: compiled.sql,
      params: compiled.params,
      tags: { surface: "publicapi", route: "sql-interface", projectId },
      preferredClickhouseService: "EventsReadOnly",
      clickhouseSettings: EXECUTION_SETTINGS,
    });
    return { columns: compiled.columns, rows };
  } catch (error) {
    if (error instanceof ClickHouseError) {
      // ClickHouse appends the rewritten query, with binds inlined, after
      // "in scope" or "while".
      const reason = error.message.split(/:? in scope |: while /i)[0];
      throw new CustomerSqlError(`Query failed: ${reason}`);
    }
    throw error;
  }
}
