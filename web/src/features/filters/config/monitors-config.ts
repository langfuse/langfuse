import { monitorsTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

export const monitorFilterConfig: FilterConfig = {
  tableName: "monitors",

  columnDefinitions: monitorsTableCols,

  defaultExpanded: ["severity", "tags"],

  defaultSidebarCollapsed: false,

  facets: [
    {
      type: "categorical" as const,
      column: "severity",
      label: "Severity",
      disableTextFilter: true,
    },
    {
      type: "categorical" as const,
      column: "tags",
      label: "Tags",
    },
  ],
};
