import { useQueryParams, withDefault, NumberParam } from "use-query-params";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";
import type { PaginationState, OnChangeFn } from "@tanstack/react-table";

// Overload for pageIndex/pageSize (returns TanStack types)
export function usePaginationState(
  defaultPageIndex: number,
  defaultPageSize: number,
  paramNames: { page: "pageIndex"; limit: "pageSize" },
): readonly [PaginationState, OnChangeFn<PaginationState>];

// Overload for page/limit (returns custom format)
export function usePaginationState(
  defaultPage?: number,
  defaultLimit?: number,
): readonly [
  { page: number; limit: number },
  (value: { page: number; limit: number }) => void,
];

// Implementation
export function usePaginationState(
  defaultPageOrIndex: number = 1,
  defaultLimitOrSize: number = 50,
  paramNames?: { page: "page" | "pageIndex"; limit: "limit" | "pageSize" },
): readonly [
  { page: number; limit: number } | PaginationState,
  (
    | ((value: { page: number; limit: number }) => void)
    | OnChangeFn<PaginationState>
  ),
] {
  const peekContext = usePeekTableState();
  const pageParam = paramNames?.page ?? "page";
  const limitParam = paramNames?.limit ?? "limit";

  const [paginationState, setPaginationState] = useQueryParams({
    [pageParam]: withDefault(NumberParam, defaultPageOrIndex),
    [limitParam]: withDefault(NumberParam, defaultLimitOrSize),
  });

  if (peekContext) {
    const { pageIndex, pageSize } = peekContext.tableState.pagination;

    if (pageParam === "pageIndex") {
      // Return TanStack PaginationState format
      const contextState: PaginationState = { pageIndex, pageSize };
      const setState: OnChangeFn<PaginationState> = (updaterOrValue) => {
        const newValue =
          typeof updaterOrValue === "function"
            ? updaterOrValue(contextState)
            : updaterOrValue;
        peekContext.setTableState({
          ...peekContext.tableState,
          pagination: newValue,
        });
      };
      return [contextState, setState] as const;
    } else {
      // Return page/limit format
      const contextState = { page: pageIndex + 1, limit: pageSize };
      const setState = (newPagination: { page: number; limit: number }) => {
        peekContext.setTableState({
          ...peekContext.tableState,
          pagination: {
            pageIndex: newPagination.page - 1,
            pageSize: newPagination.limit,
          },
        });
      };
      return [contextState, setState] as const;
    }
  }

  // Not in peek context
  if (pageParam === "pageIndex") {
    // Convert to TanStack format
    const urlState: PaginationState = {
      pageIndex: paginationState.pageIndex as number,
      pageSize: paginationState.pageSize as number,
    };
    const setUrlState: OnChangeFn<PaginationState> = (updaterOrValue) => {
      const newValue =
        typeof updaterOrValue === "function"
          ? updaterOrValue(urlState)
          : updaterOrValue;
      setPaginationState({
        pageIndex: newValue.pageIndex,
        pageSize: newValue.pageSize,
      });
    };
    return [urlState, setUrlState] as const;
  } else {
    // Return page/limit format as-is
    return [
      paginationState as { page: number; limit: number },
      setPaginationState as (value: { page: number; limit: number }) => void,
    ] as const;
  }
}
