import { type FilterState } from "@langfuse/shared";
import { usdFormatter } from "@/src/utils/numbers";

// traces do not have a startTime or endTime column, so we need to map these to the timestamp column
export const createTracesTimeFilter = (
  filters: FilterState,
  columnName = "timestamp",
) => {
  return filters.map((f) => {
    if (f.column === "startTime" || f.column === "endTime") {
      return {
        ...f,
        column: columnName,
      };
    } else {
      return f;
    }
  });
};

export const totalCostDashboardFormatted = (totalCost?: number) => {
  return totalCost
    ? totalCost < 5
      ? usdFormatter(totalCost, 2, 6)
      : usdFormatter(totalCost, 2, 2)
    : usdFormatter(0);
};
