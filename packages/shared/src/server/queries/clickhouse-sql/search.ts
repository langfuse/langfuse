import { TracingSearchType } from "../../../interfaces/search";

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

export const clickhouseSearchCondition = (
  query?: string,
  searchType?: TracingSearchType[],
  tablePrefix?: string,
  searchColumns?: string[],
) => {
  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  const defaultCols = [`${prefix}id`, `t.user_id`, `${prefix}name`];
  const cols = (searchColumns ?? defaultCols).map((col) =>
    col.includes(".") ? col : `${prefix}${col}`,
  );

  // For input/output (which can hold JSON written by an `ensure_ascii=True` serializer), also
  // match the `\uXXXX`-escaped form of the query. ASCII-only queries are unaffected: the escaped
  // form is identical, so no extra parameter or clause is emitted (keeps existing behaviour and
  // query plans for the common case). See issue #11538 and `toJsonUnicodeEscaped` above.
  const escapedQuery = query ? toJsonUnicodeEscaped(query) : undefined;
  const hasEscapedVariant = !!query && escapedQuery !== query;

  const ioColumnMatch = (col: string) =>
    hasEscapedVariant
      ? `${col} ILIKE {searchString: String} OR ${col} ILIKE {searchStringEscaped: String}`
      : `${col} ILIKE {searchString: String}`;

  // The default cols include t.user_id for callers querying via traces CTE (traces.ts, observations.ts).
  const conditions = [
    !searchType || searchType.includes("id")
      ? cols.map((col) => `${col} ILIKE {searchString: String}`).join(" OR ")
      : null,
    searchType && searchType.includes("content")
      ? `${ioColumnMatch(`${prefix}input`)} OR ${ioColumnMatch(`${prefix}output`)}`
      : null,
    searchType && searchType.includes("input")
      ? ioColumnMatch(`${prefix}input`)
      : null,
    searchType && searchType.includes("output")
      ? ioColumnMatch(`${prefix}output`)
      : null,
  ].filter(Boolean);

  return {
    query: query ? `AND (${conditions.join(" OR ")})` : "",
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
