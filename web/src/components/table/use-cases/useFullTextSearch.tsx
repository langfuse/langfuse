import type { TracingSearchType } from "@langfuse/shared";
import {
  useQueryParam,
  withDefault,
  StringParam,
  ArrayParam,
} from "use-query-params";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";

export const useFullTextSearch = () => {
  const peekContext = usePeekTableState();

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

  if (peekContext) {
    const { query, type } = peekContext.tableState.search;

    const setSearchQuery = (newQuery: string | null) => {
      peekContext.setTableState({
        ...peekContext.tableState,
        search: { ...peekContext.tableState.search, query: newQuery },
      });
    };

    const setSearchType = (newType: string[]) => {
      peekContext.setTableState({
        ...peekContext.tableState,
        search: { ...peekContext.tableState.search, type: newType },
      });
    };

    return {
      searchQuery: query,
      searchType: type as TracingSearchType[],
      setSearchQuery,
      setSearchType,
    };
  }

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
