import { TracingSearchType } from "../../../interfaces/search";

const regexIndefiniteCharacters = "%";

export const clickhouseSearchCondition = (
  query?: string,
  searchType?: TracingSearchType[],
) => {
  const conditions = [
    !searchType || searchType.includes("id")
      ? `id ILIKE {searchString: String} OR user_id ILIKE {searchString: String} OR name ILIKE {searchString: String}`
      : null,
    searchType && searchType.includes("content")
      ? `input ILIKE {searchString: String} OR output ILIKE {searchString: String}`
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
