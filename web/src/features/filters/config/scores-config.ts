import { scoresTableCols } from "@/src/server/api/definitions/scoresTable";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";
import type { ColumnToBackendKeyMap } from "@/src/features/filters/lib/filter-transform";

// Maps frontend column IDs to backend-expected column IDs
// Frontend uses "tags" but backend CH mapping expects "trace_tags" for trace tags on scores table
export const SCORE_COLUMN_TO_BACKEND_KEY: ColumnToBackendKeyMap = {
  tags: "trace_tags",
};

export const scoreFilterConfig: FilterConfig = {
  tableName: "scores",

  columnDefinitions: scoresTableCols,

  defaultExpanded: ["environment", "name"],

  defaultSidebarCollapsed: true,

  facets: [
    {
      type: "categorical" as const,
      column: "environment",
      label: "Environment",
    },
    {
      type: "categorical" as const,
      column: "name",
      label: "Name",
    },
    {
      type: "categorical" as const,
      column: "source",
      label: "Source",
    },
    {
      type: "categorical" as const,
      column: "dataType",
      label: "Data Type",
    },
    {
      type: "numeric" as const,
      column: "value",
      label: "Value",
      min: -100,
      max: 100,
    },
    {
      type: "categorical" as const,
      column: "stringValue",
      label: "String Value",
    },
    {
      type: "string" as const,
      column: "traceId",
      label: "Trace ID",
    },
    {
      type: "categorical" as const,
      column: "traceName",
      label: "Trace Name",
    },
    {
      type: "string" as const,
      column: "observationId",
      label: "Observation ID",
    },
    {
      type: "categorical" as const,
      column: "userId",
      label: "User ID",
    },
    {
      type: "categorical" as const,
      column: "tags",
      label: "Trace Tags",
    },
  ],
};
