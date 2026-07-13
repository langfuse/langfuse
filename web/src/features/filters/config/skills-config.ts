import { skillsTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

export const skillFilterConfig: FilterConfig = {
  tableName: "skills",

  columnDefinitions: skillsTableCols,

  defaultExpanded: ["labels"],

  defaultSidebarCollapsed: true,

  facets: [
    {
      type: "categorical" as const,
      column: "labels",
      label: "Labels",
    },
    {
      type: "categorical" as const,
      column: "tags",
      label: "Tags",
    },
    {
      type: "numeric" as const,
      column: "version",
      label: "Version",
      min: 1,
      max: 100,
    },
  ],
};
