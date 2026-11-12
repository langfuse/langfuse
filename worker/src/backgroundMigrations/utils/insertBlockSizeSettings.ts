/**
 * SETTINGS fragment setting minimum INSERT block thresholds for the M3 backfill.
 * These are lower bounds, not memory caps. Unset values leave the ClickHouse
 * profile in control, and zero is a valid value that must survive.
 * The env schema guarantees both arguments are non-negative integers, so
 * interpolating them into the query cannot inject SQL.
 */
export function buildInsertBlockSizeSettings(
  rows: number | undefined,
  bytes: number | undefined,
): string {
  const settings: string[] = [];
  if (rows !== undefined) settings.push(`min_insert_block_size_rows = ${rows}`);
  if (bytes !== undefined)
    settings.push(`min_insert_block_size_bytes = ${bytes}`);
  return settings.length === 0
    ? ""
    : `,\n        ${settings.join(",\n        ")}`;
}
