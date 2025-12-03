import { evalExecutionsFilterCols } from "@/src/server/api/definitions/evalExecutionsTable";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

export const evalLogFilterConfig: FilterConfig = {
  tableName: "evalLogs",

  columnDefinitions: evalExecutionsFilterCols,

  defaultExpanded: ["status"],

  defaultSidebarCollapsed: true,

  facets: [
    {
      type: "categorical" as const,
      column: "status",
      label: "Status",
    },
    {
      type: "string" as const,
      column: "traceId",
      label: "Trace ID",
    },
    {
      type: "string" as const,
      column: "sessionId",
      label: "Session ID",
    },
    {
      type: "string" as const,
      column: "executionTraceId",
      label: "Execution Trace ID",
    },
    {
      type: "numeric" as const,
      column: "scoreValue",
      label: "Score Value",
      min: 0,
      max: 1,
      step: 0.01,
    },
  ],
};
