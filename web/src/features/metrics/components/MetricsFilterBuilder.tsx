import { type FilterState, type TimeFilter } from "@langfuse/shared";
import { type ViewVersion, type views } from "@langfuse/shared/query";
import { type z } from "zod";

import { MetricsFilterBuilderV1 } from "./MetricsFilterBuilderV1";
import { MetricsFilterBuilderV2 } from "./MetricsFilterBuilderV2";

/** MetricsFilterBuilder filters metrics by the dimensions of the data model, dispatching to the version-specific fetcher. */
export const MetricsFilterBuilder = ({
  version,
  ...props
}: MetricsFilterFetcherProps & { version: ViewVersion }) => {
  if (version === "v1") return <MetricsFilterBuilderV1 {...props} />;
  return <MetricsFilterBuilderV2 {...props} />;
};

/** metricsFilterTimeFilter keys a {from, to?} range to a column as the TimeFilter[] the filter-options endpoints expect. */
export const metricsFilterTimeFilter = (
  column: "timestamp" | "startTime",
  dateRange?: MetricsFilterDateRange,
): TimeFilter[] | undefined => {
  if (!dateRange) return undefined;
  const filters: TimeFilter[] = [
    { column, type: "datetime", operator: ">=", value: dateRange.from },
  ];
  if (dateRange.to) {
    filters.push({
      column,
      type: "datetime",
      operator: "<=",
      value: dateRange.to,
    });
  }
  return filters;
};

/** MetricsFilterDateRange is the preview/lookback window used to scope filter-value discovery. */
export type MetricsFilterDateRange = { from: Date; to?: Date };

/** MetricsFilterFetcherProps is the version-agnostic contract shared by both fetchers. */
export type MetricsFilterFetcherProps = {
  view: z.infer<typeof views>;
  projectId: string;
  dateRange?: MetricsFilterDateRange;
  filters: FilterState;
  onChange: (filters: FilterState) => void;
};
