import {
  type FilterState,
  type FilterColumns,
} from "@/src/features/filters/types";
import { useState } from "react";

// manage state with hook
export const useFilterState = <cols extends FilterColumns>(
  columns: cols,
  initialState: FilterState<cols> = [],
) => {
  // TODO: switch to query params
  const [filterState, setFilterState] = useState(initialState);

  return [filterState, setFilterState] as const;
};
