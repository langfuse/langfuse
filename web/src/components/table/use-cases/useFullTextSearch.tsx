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
    // Reverting to the default scope (id) removes the `searchType` param
    // entirely instead of writing an explicit `?searchType=id`, so URLs and
    // saved views match the no-scope state regardless of which surface (search
    // bar or legacy toolbar) produced the change.
    const isDefault =
      newSearchType.length === 0 ||
      (newSearchType.length === 1 && newSearchType[0] === "id");
    handleSearchTypeChange(isDefault ? undefined : newSearchType);
  };

  const typedSearchType = (searchType ?? ["id"]) as TracingSearchType[];

  return {
    searchQuery,
    searchType: typedSearchType,
    setSearchQuery,
    setSearchType,
  };
};
