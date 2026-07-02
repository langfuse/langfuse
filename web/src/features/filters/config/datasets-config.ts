import { datasetsTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

export const datasetsFilterConfig: FilterConfig = {
  tableName: "datasets",

  columnDefinitions: datasetsTableCols,

  defaultExpanded: ["name"],

  defaultSidebarCollapsed: false,

  facets: [
    {
      type: "string" as const,
      column: "name",
      label: "Name",
    },
    {
      type: "string" as const,
      column: "description",
      label: "Description",
    },
    {
      type: "stringKeyValue" as const,
      column: "metadata",
      label: "Metadata",
    },
  ],
};
