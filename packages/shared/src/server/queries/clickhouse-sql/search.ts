import { InvalidRequestError } from "../../../errors";
import {
  hasValidTracingSearchTypes,
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  type TracingSearchType,
} from "../../../interfaces/search";
import { ftsTextTokenConjunct } from "./fts";
import { toJsonUnicodeEscaped } from "./json-unicode-escape";

const regexIndefiniteCharacters = "%";

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
  if (!hasValidTracingSearchTypes({ searchQuery: query, searchType })) {
    throw new InvalidRequestError(TRACING_SEARCH_TYPE_REQUIRED_MESSAGE);
  }

  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  const ilikeWithPrefilter = (col: string, param = "{searchString: String}") =>
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
  // query plans for the common case). See issue #11538 and `toJsonUnicodeEscaped`.
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
