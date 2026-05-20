import { TracingSearchType } from "../../../interfaces/search";
import { ftsTextTokenConjunct } from "./fts";

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
  const prefix = tablePrefix ? `${tablePrefix}.` : "";

  const ilikeWithPrefilter = (
    col: string,
    param: string = "{searchString: String}",
  ) =>
    useEventsTablePath
      ? `(${col} ILIKE ${param} AND ${ftsTextTokenConjunct(col, param)})`
      : `${col} ILIKE ${param}`;

  const defaultCols = [`${prefix}id`, `t.user_id`, `${prefix}name`];
  const cols = (searchColumns ?? defaultCols).map((col) =>
    col.includes(".") ? col : `${prefix}${col}`,
  );
  const inputCol = `${prefix}input`;
  const outputCol = `${prefix}output`;

  // The default cols include t.user_id for callers querying via traces CTE (traces.ts, observations.ts).
  const conditions = [
    !searchType || searchType.includes("id")
      ? cols.map((col) => `${col} ILIKE {searchString: String}`).join(" OR ")
      : null,
    searchType && searchType.includes("content")
      ? `${ilikeWithPrefilter(inputCol)} OR ${ilikeWithPrefilter(outputCol)}`
      : null,
    searchType && searchType.includes("input")
      ? ilikeWithPrefilter(inputCol)
      : null,
    searchType && searchType.includes("output")
      ? ilikeWithPrefilter(outputCol)
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
