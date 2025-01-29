import { type OrderByState } from "@langfuse/shared";
import { ObjectParam, useQueryParam, withDefault } from "use-query-params";

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
  const [orderByState, setOrderByState] = useQueryParam<OrderByQueryParamState>(
    "orderBy",
    withDefault(ObjectParam, initialState),
  );

  return [orderByState, setOrderByState] as [
    OrderByState,
    (orderByState: OrderByState) => void,
  ];
};
