import { quoteIdent } from "../schemaUtils";

/**
 * GreptimeDB row contract (04-read-path.md, P0b). The MySQL-wire read pool does NOT return the same
 * JS shapes ClickHouse did, so converters must not assume the CH row shape. Verified against the
 * read pool (decimalNumbers:false, supportBigNumbers:true, bigNumberStrings:true, no dateStrings):
 *
 *   | GreptimeDB column     | JS value from mysql2                         | read with        |
 *   |-----------------------|----------------------------------------------|------------------|
 *   | DECIMAL(38,12)        | string ("1.234500000000")  — precision kept  | greptimeDecimal  |
 *   | BIGINT / Int64        | string ("9223372036854775807")               | greptimeBigInt   |
 *   | TIMESTAMP(3)          | JS Date                                      | greptimeDate     |
 *   | BOOLEAN               | number 0 / 1  (NOT a boolean)                | greptimeBool     |
 *   | JSON                  | **internal jsonb binary** when SELECTed bare | see below        |
 *   | STRING                | string                                       | as-is            |
 *
 * JSON COLUMNS ARE THE TRAP: a bare `SELECT metadata` returns GreptimeDB's internal jsonb bytes, not
 * JSON text. JSON columns MUST be projected through `json_to_string(col)` in the SELECT list (use
 * `selectJsonColumn`), and the resulting text parsed with `greptimeJson` on read.
 */

/**
 * SELECT-list fragment that serializes a JSON column to text. Quotes the column (and only the
 * column — an optional table alias is kept unquoted), e.g.
 *   selectJsonColumn("metadata")                              -> json_to_string(`metadata`) AS `metadata`
 *   selectJsonColumn("metadata", { tablePrefix: "t" })        -> json_to_string(t.`metadata`) AS `metadata`
 *   selectJsonColumn("metadata", { alias: "md" })             -> json_to_string(`metadata`) AS `md`
 */
export const selectJsonColumn = (
  column: string,
  opts?: { alias?: string; tablePrefix?: string },
): string => {
  const ref = opts?.tablePrefix
    ? `${opts.tablePrefix}.${quoteIdent(column)}`
    : quoteIdent(column);
  return `json_to_string(${ref}) AS ${quoteIdent(opts?.alias ?? column)}`;
};

/** Coerce a GreptimeDB BOOLEAN (0/1 number, or already-boolean, or "0"/"1"/"true") to boolean. */
export const greptimeBool = (v: unknown): boolean => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return v === "1" || v.toLowerCase() === "true";
  return false;
};

/** Parse a `json_to_string`-projected column into a value; tolerant of already-parsed / null. */
export const greptimeJson = <T = unknown>(v: unknown, fallback: T): T => {
  if (v == null) return fallback;
  // A JSON column selected WITHOUT json_to_string() comes back as raw jsonb bytes
  // (Buffer/Uint8Array). That violates the row contract (see selectJsonColumn), so fall back rather
  // than silently return binary that an `instanceof object` check would otherwise pass through.
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return fallback;
  if (typeof v === "object") return v as T;
  if (typeof v === "string") {
    if (v === "") return fallback;
    try {
      return JSON.parse(v) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
};

/** TIMESTAMP(3) -> Date. mysql2 returns a Date already; tolerate ms-number / string forms too. */
export const greptimeDate = (v: unknown): Date | null => {
  if (v == null) return null;
  if (v instanceof Date) return v;
  if (typeof v === "number") return new Date(v);
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};

/** DECIMAL stays a string to preserve precision; normalise null. */
export const greptimeDecimal = (v: unknown): string | null =>
  v == null ? null : String(v);

/** BIGINT stays a string; callers that need a JS number do the (lossy) conversion explicitly. */
export const greptimeBigInt = (v: unknown): string | null =>
  v == null ? null : String(v);
