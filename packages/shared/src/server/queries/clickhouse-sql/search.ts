import { TracingSearchType } from "../../../interfaces/search";
import { ftsTextTokenConjunct } from "./fts";

const regexIndefiniteCharacters = "%";

/**
 * Re-encodes a string the way a JSON serializer with `ensure_ascii=True` does (e.g. Python's
 * `json.dumps`, used by the Langfuse Python SDK's EventSerializer / the OpenTelemetry ingestion
 * path): every code point >= U+0080 becomes a `\uXXXX` escape (astral code points become a
 * UTF-16 surrogate pair). ASCII is left untouched.
 *
 * Trace / observation `input` and `output` ingested through that path is persisted in ClickHouse
 * verbatim in this escaped form (e.g. `你好` is stored as the literal `你好`), so a
 * substring search for the raw, human-readable text would never match it. By also searching for
 * this escaped form we recover full-text search for non-English content. See issue #11538.
 */
const toJsonUnicodeEscaped = (value: string): string => {
  let out = "";
  for (const ch of value) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x80) {
      out += ch;
    } else if (cp <= 0xffff) {
      out += "\\u" + cp.toString(16).padStart(4, "0");
    } else {
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

export type ClickhouseSearchConditionOptions = {
  query?: string;
  searchType?: TracingSearchType[];
  tablePrefix?: string;
  searchColumns?: readonly string[];
  useEventsTablePath?: boolean;
};

export const clickhouseSearchCondition = ({
  query,
  searchType,
  tablePrefix,
  searchColumns,
  useEventsTablePath = false,
}: ClickhouseSearchConditionOptions) => {
  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  const ilikeWithPrefilter = (
    col: string,
    param: string = "{searchString: String}",
  ) =>
    // Fast-mode UI search intentionally narrows IO search to token matches
    // before applying ILIKE. This gives ClickHouse an inverted-index lookup,
    // but drops embedded-word substring matches like "foobarneedle".
    useEventsTablePath
      ? `(${col} ILIKE ${param} AND ${ftsTextTokenConjunct(col, param)})`
      : `${col} ILIKE ${param}`;

  const defaultCols = [`${prefix}id`, `t.user_id`, `${prefix}name`];
  const cols = (searchColumns ?? defaultCols).map((col) =>
    col.includes(".") ? col : `${prefix}${col}`,
  );
  const inputCol = `${prefix}input`;
  const outputCol = `${prefix}output`;
  const requiresEventsFull =
    Boolean(query) &&
    Boolean(
      searchType?.includes("content") ||
      searchType?.includes("input") ||
      searchType?.includes("output"),
    );

  // For input/output (which can hold JSON written by an `ensure_ascii=True` serializer), also
  // match the `\uXXXX`-escaped form of the query. ASCII-only queries are unaffected: the escaped
  // form is identical, so no extra parameter or clause is emitted (keeps existing behaviour and
  // query plans for the common case). See issue #11538 and `toJsonUnicodeEscaped` above.
  const escapedQuery = query ? toJsonUnicodeEscaped(query) : undefined;
  const hasEscapedVariant = !!query && escapedQuery !== query;

  const ioColumnMatch = (col: string) =>
    hasEscapedVariant
      ? `${ilikeWithPrefilter(col)} OR ${ilikeWithPrefilter(
          col,
          "{searchStringEscaped: String}",
        )}`
      : ilikeWithPrefilter(col);

  // The default cols include t.user_id for callers querying via traces CTE (traces.ts, observations.ts).
  const conditions = [
    !searchType || searchType.includes("id")
      ? cols.map((col) => `${col} ILIKE {searchString: String}`).join(" OR ")
      : null,
    searchType && searchType.includes("content")
      ? `${ioColumnMatch(inputCol)} OR ${ioColumnMatch(outputCol)}`
      : null,
    searchType && searchType.includes("input") ? ioColumnMatch(inputCol) : null,
    searchType && searchType.includes("output")
      ? ioColumnMatch(outputCol)
      : null,
  ].filter(Boolean);

  return {
    query: query ? `AND (${conditions.join(" OR ")})` : "",
    requiresEventsFull,
    params: query
      ? {
          searchString: `${regexIndefiniteCharacters}${query}${regexIndefiniteCharacters}`,
          ...(hasEscapedVariant
            ? {
                searchStringEscaped: `${regexIndefiniteCharacters}${escapedQuery}${regexIndefiniteCharacters}`,
              }
            : {}),
        }
      : {},
  };
};
