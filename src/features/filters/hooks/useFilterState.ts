import { type FilterState } from "@/src/features/filters/types";
import { useState } from "react";

// manage state with hook
export const useFilterState = (initialState: FilterState = []) => {
  const [filterState, setFilterState] = useState(initialState);
  return [filterState, setFilterState] as const;
};
