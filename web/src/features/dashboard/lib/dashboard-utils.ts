import { type FilterState } from "@langfuse/shared";
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

/**
 * Returns the view, filters, and metric for a "traces count" query.
 * Both v1 and v2 query the traces view with count/count metric.
 * v2 uses eventsTracesView (ClickHouse events table) which aggregates per trace_id
 * and falls back to the root span name when trace_name is empty.
 */
export function traceViewQuery(params: {
  metricsVersion: ViewVersion | undefined;
  globalFilterState: FilterState;
  groupedByName?: boolean;
}): Pick<QueryType, "view" | "filters" | "metrics"> {
  return {
    view: "traces",
    filters: mapLegacyUiTableFilterToView("traces", params.globalFilterState),
    metrics: [{ measure: "count", aggregation: "count" }],
  };
}
