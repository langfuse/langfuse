import { quoteIdent } from "../../greptime/schemaUtils";
import { greptimeTimestampLiteral } from "../../greptime/sql/greptime-filter";

/**
 * Shared SQL fragments for the GreptimeDB read repositories (04-read-path.md, P1).
 *
 * Two invariants every projection read carries:
 *   - `AND is_deleted = false` — GreptimeDB soft-deletes via a tombstone row (merge_mode keeps the
 *     last write); ClickHouse physically deleted, so this guard is new and mandatory.
 *   - explicit SELECT lists (the `greptime*Select` builders), never `SELECT *` — a bare JSON column
 *     comes back as raw jsonb bytes over the MySQL wire (see rowContract).
 */

/** `is_deleted = false` guard, optionally aliased (`t.is_deleted = false`). */
export const notDeleted = (prefix?: string): string =>
  `${prefix ? `${prefix}.` : ""}${quoteIdent("is_deleted")} = false`;

/**
 * Expand an array into a named IN-list (mysql2 does not splice arrays into named placeholders).
 * Empty list -> `1 = 0` (matches nothing), so callers that must short-circuit should guard before.
 */
export const greptimeInClause = (
  ref: string,
  values: readonly (string | number)[],
  prefix: string,
): { sql: string; params: Record<string, string | number> } => {
  if (values.length === 0) return { sql: "1 = 0", params: {} };
  const params: Record<string, string | number> = {};
  const placeholders = values.map((v, i) => {
    const name = `${prefix}_${i}`;
    params[name] = v;
    return `:${name}`;
  });
  return { sql: `${ref} IN (${placeholders.join(", ")})`, params };
};

/** Bind a Date as a ms-precision GreptimeDB timestamp literal (string -> TIMESTAMP coercion). */
export const greptimeTsParam = (d: Date): string => greptimeTimestampLiteral(d);

/** UTC calendar-day bounds [start, end) for a same-day match, as ms-precision literals. */
export const greptimeDayBounds = (d: Date): { start: string; end: string } => {
  const start = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    start: greptimeTimestampLiteral(start),
    end: greptimeTimestampLiteral(end),
  };
};
