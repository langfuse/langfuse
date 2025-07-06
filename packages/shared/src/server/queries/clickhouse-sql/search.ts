import { TracingSearchType } from "../../../interfaces/search";

const regexIndefiniteCharacters = "%";

export const clickhouseSearchCondition = (
  query?: string,
  searchType?: TracingSearchType[],
  tablePrefix?: string,
) => {
  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  const conditions = [
    !searchType || searchType.includes("id")
      ? `${prefix}id ILIKE {searchString: String} OR user_id ILIKE {searchString: String} OR ${prefix}name ILIKE {searchString: String}`
      : null,
    searchType && searchType.includes("content")
      ? `${prefix}input ILIKE {searchString: String} OR ${prefix}output ILIKE {searchString: String}`
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
