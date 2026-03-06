import { TracingSearchType } from "../../../interfaces/search";

const regexIndefiniteCharacters = "%";

export const clickhouseSearchCondition = (
  query?: string,
  searchType?: TracingSearchType[],
  tablePrefix?: string,
  searchColumns?: string[],
) => {
  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  const cols = searchColumns
    ? searchColumns
    : [`${prefix}id`, `t.user_id`, `${prefix}name`];

  // We use a hard-coded prefix for user_id as it only occurs in the trace context.
  const conditions = [
    !searchType || searchType.includes("id")
      ? cols.map((col) => `${col} ILIKE {searchString: String}`).join(" OR ")
      : null,
    searchType && searchType.includes("content")
      ? `${prefix}input ILIKE {searchString: String} OR ${prefix}output ILIKE {searchString: String}`
      : null,
    searchType && searchType.includes("input")
      ? `${prefix}input ILIKE {searchString: String}`
      : null,
    searchType && searchType.includes("output")
      ? `${prefix}output ILIKE {searchString: String}`
      : null,
  ].filter(Boolean);

  return {
    query: query ? `AND (${conditions.join(" OR ")})` : "",
    params: query
      ? {
          searchString: `${regexIndefiniteCharacters}${query}${regexIndefiniteCharacters}`,
        }
      : {},
  };
};
