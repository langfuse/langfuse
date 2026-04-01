import { type OrderByState } from "@langfuse/shared";
import { ObjectParam, useQueryParam, withDefault } from "use-query-params";
import { usePeekTableState } from "@/src/components/table/peek/contexts/PeekTableStateContext";

type OrderByQueryParamState =
  | OrderByState
  | { [key: string]: string | undefined };

/**
 * useOrderByState is a custom hook to manage the ordering settings (for a table).
 * It does so via query params.
 * @param initialState default ordering
 * @returns [orderByState, setOrderByState]
 */
export const useOrderByState = (initialState: OrderByState = null) => {
  const peekContext = usePeekTableState();

  const [orderByState, setOrderByState] = useQueryParam<OrderByQueryParamState>(
    "orderBy",
    withDefault(ObjectParam, initialState),
  );

  if (peekContext) {
    const setState = (newSorting: OrderByState) => {
      peekContext.setTableState({
        ...peekContext.tableState,
        sorting: newSorting,
      });
    };
    return [peekContext.tableState.sorting, setState] as [
      OrderByState,
      (orderByState: OrderByState) => void,
    ];
  }

  return [orderByState, setOrderByState] as [
    OrderByState,
    (orderByState: OrderByState) => void,
  ];
};
