import { type ClickHouseSettings } from "@clickhouse/client";

const DELETE_FROM_TABLE =
  /^\s*DELETE\s+FROM\s+(?:`?\w+`?\.)?`?(\w+)`?(?=[\s;]|$)/i;

/**
 * Forces a plain lightweight delete (`alter_update`) when `query` is a
 * `DELETE FROM` on one of `excludedTables`, whatever
 * CLICKHOUSE_LIGHTWEIGHT_DELETE_MODE sets on the client. Lightweight-update
 * deletes can change or hide rows they did not match on a table that got
 * `enable_block_number_column` by ALTER after it already held merged parts.
 */
export function getLightweightDeleteModeOverride(
  query: string,
  excludedTables: readonly string[],
): ClickHouseSettings {
  if (excludedTables.length === 0) return {};
  const table = DELETE_FROM_TABLE.exec(query)?.[1]?.toLowerCase();
  return table && excludedTables.includes(table)
    ? { lightweight_delete_mode: "alter_update" }
    : {};
}
