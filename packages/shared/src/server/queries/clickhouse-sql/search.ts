const regexIndefiniteCharacters = "%";

export const clickhouseSearchCondition = (query?: string) => {
  return {
    query: query
      ? `
    AND (
      id ILIKE {searchString: String} OR 
      user_id ILIKE {searchString: String} OR 
      name ILIKE {searchString: String}
    )
  `
      : "",
    params: query
      ? {
          searchString: `${regexIndefiniteCharacters}${query}${regexIndefiniteCharacters}`,
        }
      : {},
  };
};
