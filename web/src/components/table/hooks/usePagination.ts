import useSessionStorage from "@/src/components/useSessionStorage";
import { OnChangeFn, Updater } from "@tanstack/react-table";
import { useState } from "react";
import { useQueryParams, withDefault, NumberParam } from "use-query-params";

export type PaginationState = {
  pageIndex: number;
  pageSize: number;
};

type PaginationHookResult = {
  paginationState: PaginationState;
  setPaginationState: OnChangeFn<PaginationState>;
};

/**
 * A hook for managing pagination state, either through URL or local state
 *
 * @param isLocalPagination If true, uses local React state in combination with session storage instead of URL parameters
 * @param initialState The initial pagination state
 * @param paramNames Optional custom parameter names for URL-based pagination
 */
export function usePagination(
  isLocalPagination = false,
  initialState: PaginationState = { pageIndex: 0, pageSize: 50 },
  paramNames: { pageIndex: string; pageSize: string } = {
    pageIndex: "pageIndex",
    pageSize: "pageSize",
  },
): PaginationHookResult {
  const [storedPageSize, setStoredPageSize] = useSessionStorage(
    "scoresPageSize",
    initialState.pageSize,
  );
  const [localState, setLocalState] = useState<PaginationState>({
    ...initialState,
    pageSize: storedPageSize,
  });

  // URL state version
  const [urlState, setUrlState] = useQueryParams({
    [paramNames.pageIndex]: withDefault(NumberParam, initialState.pageIndex),
    [paramNames.pageSize]: withDefault(NumberParam, initialState.pageSize),
  });

  const paginationState = isLocalPagination
    ? localState
    : {
        pageIndex: urlState[paramNames.pageIndex],
        pageSize: urlState[paramNames.pageSize],
      };

  // Create a unified setter function
  const setPaginationState: OnChangeFn<PaginationState> = (
    updaterOrValue: Updater<PaginationState>,
  ) => {
    const updatedState =
      typeof updaterOrValue === "function"
        ? updaterOrValue(paginationState)
        : { ...paginationState, ...updaterOrValue };

    if (isLocalPagination) {
      setLocalState(updatedState);
      setStoredPageSize(updatedState.pageSize);
    } else {
      setUrlState({
        [paramNames.pageIndex]: updatedState.pageIndex,
        [paramNames.pageSize]: updatedState.pageSize,
      });
    }
  };

  return { paginationState, setPaginationState };
}
