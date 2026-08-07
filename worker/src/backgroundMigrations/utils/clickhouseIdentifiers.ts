function assertClickhouseIdentifier(value: string, label: string): void {
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
  return "`" + escaped + "`";
}

/**
 * Qualifies a ClickHouse table so distributed DDL is not resolved against the
 * server's default database on remote DDL workers.
 */
export function qualifiedClickhouseTableName(
  database: string,
  table: string,
): string {
  return `${quoteClickhouseIdentifier(database, "database")}.${quoteClickhouseIdentifier(table, "table")}`;
}
