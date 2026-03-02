import { TracingSearchType } from "../../../interfaces/search";

const regexIndefiniteCharacters = "%";

export const oceanbaseSearchCondition = (
  query?: string,
  searchType?: TracingSearchType[],
  tablePrefix?: string,
  searchColumns?: string[],
) => {
  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  const cols = searchColumns
    ? searchColumns
    : [`${prefix}id`, `t.user_id`, `${prefix}name`];

  // OceanBase: Use LIKE instead of ILIKE (case-insensitive search)
  // We use a hard-coded prefix for user_id as it only occurs in the trace context.
  const conditions = [
    !searchType || searchType.includes("id")
      ? cols
          .map((col) => `LOWER(${col}) LIKE LOWER({searchString: String})`)
          .join(" OR ")
      : null,
    searchType && searchType.includes("content")
      ? `LOWER(${prefix}input) LIKE LOWER({searchString: String}) OR LOWER(${prefix}output) LIKE LOWER({searchString: String})`
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
