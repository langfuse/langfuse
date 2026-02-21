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

/** Filter to exclude events with empty trace_name (observations view only). */
export const TRACE_NAME_NOT_NULL_FILTER: z.infer<typeof singleFilter> = {
  type: "null",
  column: "traceName",
  operator: "is not null",
  value: "",
};

/**
 * Returns the view, filters, and metric for a "traces count" query.
 * v1: queries traces view with count/count metric.
 * v2: queries observations view with traceId/uniq metric (uniq(trace_id)).
 */
export function traceViewQuery(params: {
  metricsVersion: ViewVersion | undefined;
  globalFilterState: FilterState;
  groupedByName?: boolean;
}): Pick<QueryType, "view" | "filters" | "metrics"> {
  if (params.metricsVersion === "v2") {
    const filters = [
      ...mapLegacyUiTableFilterToView("observations", params.globalFilterState),
      ...(params.groupedByName ? [TRACE_NAME_NOT_NULL_FILTER] : []),
    ];
    return {
      view: "observations",
      filters,
      metrics: [{ measure: "traceId", aggregation: "uniq" }],
    };
  }
  return {
    view: "traces",
    filters: mapLegacyUiTableFilterToView("traces", params.globalFilterState),
    metrics: [{ measure: "count", aggregation: "count" }],
  };
}
