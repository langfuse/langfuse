import { type OrderByState } from "@/src/features/orderBy/types";
import { ObjectParam, useQueryParam, withDefault } from "use-query-params";

type OrderByQueryParamState =
  | OrderByState
  | { [key: string]: string | undefined };

// manage state with hook
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
