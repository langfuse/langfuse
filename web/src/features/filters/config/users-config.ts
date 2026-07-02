import { usersTableCols } from "@langfuse/shared";
import type { FilterConfig } from "@/src/features/filters/lib/filter-config";

export const usersFilterConfig: FilterConfig = {
  tableName: "users",

  columnDefinitions: usersTableCols,

  defaultExpanded: ["userId"],

  defaultSidebarCollapsed: false,

  facets: [
    {
      type: "categorical" as const,
      column: "userId",
      label: "User ID",
    },
  ],
};
