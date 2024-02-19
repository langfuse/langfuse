import { type FilterState } from "@/src/features/filters/types";

export const createTracesTimeFilter = (filters: FilterState) => {
  return filters.map((f) => {
    if (f.column === "startTime" || f.column === "endTime") {
      return {
        ...f,
        column: "timestamp",
      };
    } else {
      return f;
    }
  });
};
