import { TracingSearchType } from "../../../interfaces/search";
import { escapeSqlLikePattern } from "../../utils/sqlLike";
import { quoteIdent } from "../schemaUtils";

/**
 * Content search for the GreptimeDB read path (04-read-path.md, P0b) — mirrors
 * `clickhouse-sql/search.ts`. GreptimeDB has no `ILIKE`; case-insensitive substring search is
 * `lower(col) LIKE lower(:p)`. Substring search over input/output is scan-prone (the FULLTEXT index
 * accelerates whole-term `matches_term`, not arbitrary substrings) — acceptable for the UI search
 * box; revisit if it becomes a hotspot.
 */

/**
 * Re-encode like a `ensure_ascii=True` JSON serializer (Python SDK / OTel path): every code point
 * >= U+0080 becomes `\\uXXXX` (astral -> surrogate pair). input/output ingested that way is stored
 * verbatim in escaped form, so a raw non-ASCII substring would never match without this. (Mirrors
 * clickhouse-sql/search.ts `toJsonUnicodeEscaped`; kept local to avoid importing the CH module.)
 */
const toJsonUnicodeEscaped = (value: string): string => {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) out += ch;
    else if (cp <= 0xffff) out += "\\u" + cp.toString(16).padStart(4, "0");
    else {
      const v = cp - 0x10000;
      out +=
        "\\u" +
        (0xd800 + (v >> 10)).toString(16).padStart(4, "0") +
        "\\u" +
        (0xdc00 + (v & 0x3ff)).toString(16).padStart(4, "0");
    }
  }
  return out;
};

export type GreptimeSearchConditionOptions = {
  query?: string;
  searchType?: TracingSearchType[];
  tablePrefix?: string;
  /** Identifier columns searched for the "id" search type (default: id, user_id, name). */
  searchColumns?: readonly string[];
};

/**
 * Returns a leading-`AND` search clause + named params, or empty when no query. Caller appends it to
 * the WHERE clause and spreads the params.
 */
export const greptimeSearchCondition = ({
  query,
  searchType,
  tablePrefix,
  searchColumns,
}: GreptimeSearchConditionOptions): {
  query: string;
  params: Record<string, string>;
} => {
  if (!query) return { query: "", params: {} };
  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  const ref = (col: string) =>
    col.includes(".") ? col : `${prefix}${quoteIdent(col)}`;

  const params: Record<string, string> = {};
  const bindLike = (raw: string): string => {
    const name = `s${Object.keys(params).length}`;
    params[name] = `%${escapeSqlLikePattern(raw)}%`;
    return `:${name}`;
  };

  const likeCI = (colRef: string, raw: string) =>
    `lower(${colRef}) LIKE lower(${bindLike(raw)})`;

  const escaped = toJsonUnicodeEscaped(query);
  const hasEscaped = escaped !== query;

  // input/output may hold ensure_ascii-escaped JSON -> also match the escaped form.
  const ioMatch = (col: string) => {
    const c = ref(col);
    return hasEscaped
      ? `(${likeCI(c, query)} OR ${likeCI(c, escaped)})`
      : likeCI(c, query);
  };

  const idCols = (searchColumns ?? ["id", "user_id", "name"]).map(ref);

  const conditions = [
    !searchType || searchType.includes("id")
      ? idCols.map((c) => likeCI(c, query)).join(" OR ")
      : null,
    searchType?.includes("content")
      ? `${ioMatch("input")} OR ${ioMatch("output")}`
      : null,
    searchType?.includes("input") ? ioMatch("input") : null,
    searchType?.includes("output") ? ioMatch("output") : null,
  ].filter(Boolean);

  return { query: `AND (${conditions.join(" OR ")})`, params };
};
