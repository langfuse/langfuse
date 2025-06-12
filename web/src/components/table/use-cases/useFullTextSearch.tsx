import type { TracingSearchType } from "@langfuse/shared";
import {
  useQueryParam,
  withDefault,
  StringParam,
  ArrayParam,
} from "use-query-params";

export const useFullTextSearch = () => {
  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  // Search type can be either "id" or "metadata". Keep it untyped here and
  // cast later to the stricter `TracingSearchType[]` to avoid type mismatch
  // with the generic `ArrayParam` from `use-query-params`.
  const [searchType, handleSearchTypeChange] = useQueryParam(
    "searchType",
    withDefault(ArrayParam, ["id"]),
  );

  const setSearchType = (newSearchType: TracingSearchType[]) => {
    handleSearchTypeChange(newSearchType);
  };

  const typedSearchType = (searchType ?? ["id"]) as TracingSearchType[];

  return {
    searchQuery,
    searchType: typedSearchType,
    setSearchQuery,
    setSearchType,
  };
};
