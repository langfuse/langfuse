import { type FilterState } from "@/src/features/filters/types";

// traces do not have a startTime or endTime column, so we need to map these to the timestamp column
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
