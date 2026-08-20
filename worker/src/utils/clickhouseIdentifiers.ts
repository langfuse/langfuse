/**
 * Quoting helpers for ClickHouse identifiers that have to be interpolated into
 * SQL text rather than bound as query parameters — table/database/cluster names
 * in DDL and SYSTEM statements cannot be parameterized.
 */

export function assertClickhouseIdentifier(value: string, label: string): void {
  if (value.length === 0 || value.includes("\0")) {
    throw new Error(`Invalid ClickHouse ${label}: ${value}`);
  }
}

export function quoteClickhouseIdentifier(
  value: string,
  label: string,
): string {
  assertClickhouseIdentifier(value, label);
  const escaped = value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
  return `\`${escaped}\``;
}

export function quoteClickhouseString(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * Qualifies a table with its database.
 *
 * Required for `SYSTEM ... ON CLUSTER` statements: `AddDefaultDatabaseVisitor`
 * only fills in the initiator's current database for `ASTAlterQuery`,
 * `ASTQueryWithTableAndOutput` and `ASTRenameQuery`. `ASTSystemQuery` is not
 * visited, so an unqualified name reaches each host's DDL worker unqualified
 * and resolves against that server's default database (`default`) instead of
 * `CLICKHOUSE_DB`.
 */
export function qualifiedClickhouseTableName(
  database: string,
  table: string,
): string {
  return `${quoteClickhouseIdentifier(database, "database")}.${quoteClickhouseIdentifier(table, "table")}`;
}
