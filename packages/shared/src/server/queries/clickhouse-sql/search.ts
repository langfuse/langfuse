import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import {
  hasValidTracingSearchTypes,
  TRACING_SEARCH_TYPE_REQUIRED_MESSAGE,
  type TracingSearchType,
} from "../../../interfaces/search";
import { toJsonUnicodeEscaped } from "../../utils/searchText";
import { escapeSqlLikePattern } from "../../utils/sqlLike";
import { bareFtsField, ftsTextTokenPredicate, hasFtsSearchToken } from "./fts";

const regexIndefiniteCharacters = "%";

// events_full ngrambf_v1 skip indexes are defined on lower(<col>). ILIKE on the
// raw column cannot use them; the query must match lower(col) LIKE lower(...).
// Every leading-wildcard disjunct in the search OR must be index-usable or
// ClickHouse discards the input/output text indexes for the whole query.
const NGRAM_SUBSTRING_COLUMNS = new Set([
  "name",
  "trace_name",
  "user_id",
  "session_id",
]);

// span_id/trace_id are UUID-shaped: an ngrambf on hex+hyphen prunes almost
// nothing, so we match by equality against their existing bloom_filter (and,
// for span_id, the primary key) instead of adding an index. Exact-match and
// case-sensitive on the events path; callers paste whole ids.
const EQUALITY_ID_COLUMNS = new Set(["span_id", "trace_id"]);

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

  const ilikeWithPrefilter = (
    col: string,
    param = "{searchString: String}",
    hasToken = false,
  ) =>
    // Fast-mode UI search intentionally narrows IO search to token matches
    // before applying ILIKE. This gives ClickHouse an inverted-index lookup,
    // but drops embedded-word substring matches like "foobarneedle". The token
    // prefilter is only meaningful when the value yields tokens; a tokenless
    // value leans on ILIKE alone.
    useEventsTablePath && hasToken
      ? `(${col} ILIKE ${param} AND ${ftsTextTokenPredicate(col, param)})`
      : `${col} ILIKE ${param}`;

  const idLaneMatch = (col: string) => {
    if (useEventsTablePath) {
      const bare = bareFtsField(col);
      if (EQUALITY_ID_COLUMNS.has(bare)) {
        return `${col} = {searchStringExact: String}`;
      }
      if (NGRAM_SUBSTRING_COLUMNS.has(bare)) {
        return `lower(${col}) LIKE lower({searchString: String})`;
      }
    }
    return `${col} ILIKE {searchString: String}`;
  };

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

  // `hasFtsSearchToken` mirrors ClickHouse's `tokens()` emptiness, so the token
  // prefilter can be gated per search value at build time.
  const searchStringHasToken = !!query && hasFtsSearchToken(query);
  const searchStringEscapedHasToken =
    hasEscapedVariant && hasFtsSearchToken(escapedQuery!);

  const ioColumnMatch = (col: string) =>
    hasEscapedVariant
      ? `${ilikeWithPrefilter(
          col,
          "{searchString: String}",
          searchStringHasToken,
        )} OR ${ilikeWithPrefilter(
          col,
          "{searchStringEscaped: String}",
          searchStringEscapedHasToken,
        )}`
      : ilikeWithPrefilter(col, "{searchString: String}", searchStringHasToken);

  // The default cols include t.user_id for callers querying via traces CTE (traces.ts, observations.ts).
  const conditions = [
    !searchType || searchType.includes("id")
      ? cols.map((col) => idLaneMatch(col)).join(" OR ")
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
          searchString: `${regexIndefiniteCharacters}${escapeSqlLikePattern(query)}${regexIndefiniteCharacters}`,
          // Unwrapped for the events-path equality columns (span_id/trace_id).
          ...(useEventsTablePath ? { searchStringExact: query } : {}),
          ...(hasEscapedVariant
            ? {
                searchStringEscaped: `${regexIndefiniteCharacters}${escapeSqlLikePattern(escapedQuery!)}${regexIndefiniteCharacters}`,
              }
            : {}),
        }
      : {},
  };
};
