import { type z } from "zod/v4";
import { type FilterState, type singleFilter } from "@langfuse/shared";
import { usdFormatter } from "@/src/utils/numbers";
import {
  type QueryType,
  type ViewVersion,
  mapLegacyUiTableFilterToView,
} from "@/src/features/query";

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

export const ROOT_OBSERVATION_FILTER: z.infer<typeof singleFilter> = {
  type: "null",
  column: "parentObservationId",
  operator: "is null",
  value: "",
};

/**
 * Returns the view name and filters for a "traces-like" query that works in
 * both v1 (queries the traces table) and v2 (queries observations with a
 * root-event filter so counting root observations equals counting traces).
 */
export function traceViewQuery(
  metricsVersion: ViewVersion | undefined,
  globalFilterState: FilterState,
): Pick<QueryType, "view" | "filters"> {
  if (metricsVersion === "v2") {
    return {
      view: "observations",
      filters: [
        ...mapLegacyUiTableFilterToView("observations", globalFilterState),
        ROOT_OBSERVATION_FILTER,
      ],
    };
  }
  return {
    view: "traces",
    filters: mapLegacyUiTableFilterToView("traces", globalFilterState),
  };
}
