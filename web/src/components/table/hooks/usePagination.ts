import useSessionStorage from "@/src/components/useSessionStorage";
import { type OnChangeFn, type Updater } from "@tanstack/react-table";
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

type usePaginationProps = {
  initialState: PaginationState;
  isLocalPagination?: boolean;
  tableName: string;
};

/**
 * A hook for managing pagination state, either through URL or local state
 *
 * @param initialState The initial pagination state
 * @param isLocalPagination If true, uses local React state in combination with session storage instead of URL parameters
 * @param tableName The name of the table to store the pagination state in session storage
 */
export function usePagination({
  initialState = { pageIndex: 0, pageSize: 50 },
  isLocalPagination = false,
  tableName,
}: usePaginationProps): PaginationHookResult {
  const [storedPageSize, setStoredPageSize] = useSessionStorage(
    `storedPageSize-${tableName}`,
    initialState.pageSize,
  );
  const [localState, setLocalState] = useState<PaginationState>({
    ...initialState,
    pageSize: storedPageSize,
  });

  // URL state version
  const [urlState, setUrlState] = useQueryParams({
    pageIndex: withDefault(NumberParam, initialState.pageIndex),
    pageSize: withDefault(NumberParam, initialState.pageSize),
  });

  const paginationState = isLocalPagination
    ? localState
    : {
        pageIndex: urlState.pageIndex,
        pageSize: urlState.pageSize,
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
        pageIndex: updatedState.pageIndex,
        pageSize: updatedState.pageSize,
      });
    }
  };

  return { paginationState, setPaginationState };
}
