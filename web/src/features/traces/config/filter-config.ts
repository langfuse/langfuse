import { tracesTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import { TRACE_COLUMN_TO_QUERY_KEY } from "@/src/components/table/utils/filter-encoding";

export const traceFilterConfig: FilterConfig = {
  tableName: "traces",

  columnToQueryKey: TRACE_COLUMN_TO_QUERY_KEY,

  columnDefinitions: tracesTableCols,

  defaultExpanded: ["name"],

  facets: [
    {
      type: "categorical" as const,
      column: "environment",
      label: "Environment",
    },
    {
      type: "boolean" as const,
      column: "bookmarked",
      label: "Bookmarked",
      trueLabel: "Bookmarked",
      falseLabel: "Not bookmarked",
    },
    {
      type: "categorical" as const,
      column: "name",
      label: "Name",
    },
    {
      type: "categorical" as const,
      column: "tags",
      label: "Tags",
    },
    {
      type: "categorical" as const,
      column: "level",
      label: "Level",
    },
    {
      type: "numeric" as const,
      column: "latency",
      label: "Latency",
      min: 0,
      max: 60,
      unit: "s",
    },
  ],
};
