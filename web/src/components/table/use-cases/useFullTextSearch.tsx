import type { TracingSearchType } from "@langfuse/shared";
import {
  useQueryParam,
  withDefault,
  StringParam,
  ArrayParam,
} from "use-query-params";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import { hasFullTextSearchType } from "@/src/components/table/utils/searchUtils";

export const useFullTextSearch = ({
  tableAllowsFullTextSearch = true,
}: {
  tableAllowsFullTextSearch?: boolean;
} = {}) => {
  const peekContext = usePeekTableState();
  // Apply the host policy on reads too: instance config can resolve after a
  // URL has already restored its scope.
  const allowedSearchType = (type: TracingSearchType[]): TracingSearchType[] =>
    !tableAllowsFullTextSearch && hasFullTextSearchType(type) ? ["id"] : type;

  const [searchQuery, setSearchQuery] = useQueryParam(
    "search",
    withDefault(StringParam, null),
  );

  // Search type is one of "id", "content", "input", or "output"
  // (TracingSearchType). Keep it untyped here and cast later to the stricter
  // `TracingSearchType[]` to avoid type mismatch with the generic `ArrayParam`
  // from `use-query-params`.
  const [searchType, handleSearchTypeChange] = useQueryParam(
    "searchType",
    withDefault(ArrayParam, ["id"]),
  );

  if (peekContext) {
    const { query, type } = peekContext.tableState.search;

    const setSearchQuery = (newQuery: string | null) => {
      peekContext.setTableState((state) => ({
        ...state,
        search: { ...state.search, query: newQuery },
      }));
    };

    const setSearchType = (newType: TracingSearchType[]) => {
      peekContext.setTableState((state) => ({
        ...state,
        search: {
          ...state.search,
          type: allowedSearchType(newType),
        },
      }));
    };

    return {
      searchQuery: query,
      searchType: allowedSearchType(type as TracingSearchType[]),
      setSearchQuery,
      setSearchType,
    };
  }

  const setSearchType = (newSearchType: TracingSearchType[]) => {
    const allowedType = allowedSearchType(newSearchType);
    // Reverting to the default scope (id) removes the `searchType` param
    // entirely instead of writing an explicit `?searchType=id`, so URLs and
    // saved views match the no-scope state regardless of which surface (search
    // bar or legacy toolbar) produced the change.
    const isDefault =
      allowedType.length === 0 ||
      (allowedType.length === 1 && allowedType[0] === "id");
    handleSearchTypeChange(isDefault ? undefined : allowedType);
  };

  const typedSearchType = (searchType ?? ["id"]) as TracingSearchType[];

  return {
    searchQuery,
    searchType: allowedSearchType(typedSearchType),
    setSearchQuery,
    setSearchType,
  };
};
